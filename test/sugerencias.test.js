// Prueba la orquestación de SugerenciaService con modelos falsos (sin base de datos ni red).
import test from "node:test";
import assert from "node:assert/strict";
import { database } from "../src/config/Database.js";
import SugerenciaService from "../src/services/SugerenciaService.js";

database.transaction = async (cb) => cb({}); // sin MySQL: la "transacción" solo ejecuta el callback

const trabajadores = (extra = {}) => [
  { id: 1, nombre: "Ana Pérez", turno: "matutino", plantilla: true, excepcion: null, trabaja: true },
  { id: 2, nombre: "Beto Ruiz", turno: "matutino", plantilla: true, excepcion: null, trabaja: true },
  { id: 5, nombre: "Eva Soto", turno: "matutino", plantilla: true, excepcion: null, trabaja: true },
  { id: 3, nombre: "Carlos Gil", turno: "vespertino", plantilla: true, excepcion: null, trabaja: true },
  { id: 4, nombre: "Dana Paz", turno: "vespertino", plantilla: true, excepcion: null, trabaja: true },
].map((t) => ({ ...t, ...(extra[t.id] || {}) }));

function crearServicio({ estado = trabajadores(), probMatutino = 85, probVespertino = 20 } = {}) {
  const s = new SugerenciaService();
  const log = { sugerencias: [], notificaciones: [], excepciones: [], respuestas: [], predicciones: [] };
  let nextId = 100;

  s.horarioModel.findByDia = async (dia) => ({ dia });
  s.climaService.obtenerDia = async () => ({
    probLluvia: Math.max(probMatutino, probVespertino),
    turnos: { matutino: { probLluvia: probMatutino }, vespertino: { probLluvia: probVespertino } },
  });
  s.demandaModel.primeraCita = async () => null; // sin historial: se usa la demanda base
  s.demandaModel.upsertPrediccion = async (p) => log.predicciones.push(p);
  s.demandaModel.findPredicciones = async () => ({ matutino: { necesarios: 2 }, vespertino: { necesarios: 2 } });
  s.cronogramaModel.estadoDia = async () => estado;
  s.cronogramaModel.contarPorSugerencia = async () => new Map();
  s.cronogramaModel.upsertExcepcion = async (e) => log.excepciones.push(e);
  s.model.findAll = async () => [];
  s.model.create = async (x) => { log.sugerencias.push(x); return nextId++; };
  s.model.responder = async (id, estadoNuevo) => log.respuestas.push([id, estadoNuevo]);
  s.model.bloquearFecha = async () => {};
  s.notificacionModel.create = async (idUsuario, idOrden, mensaje) => log.notificaciones.push({ idUsuario, mensaje });
  s.usuarioModel.findAll = async () => [{ id: 99 }]; // un administrador
  return { s, log };
}

test("generar: con lluvia en la mañana y personal de sobra sugiere descansar a uno y avisa al admin", async () => {
  const { s, log } = crearServicio();
  const r = await s.generar(s.manana());
  assert.equal(r.creadas, 1);
  assert.deepEqual(log.sugerencias.map((x) => [x.idTrabajador, x.tipo]), [[1, "descansar"]]);
  assert.equal(log.notificaciones.length, 2); // al trabajador y al administrador
  assert.equal(log.notificaciones[0].idUsuario, 1);
  assert.equal(log.predicciones.length, 2); // una por turno
});

test("generar: sin lluvia no sugiere nada", async () => {
  const { s, log } = crearServicio({ probMatutino: 10, probVespertino: 10 });
  const r = await s.generar(s.manana());
  assert.equal(r.creadas, 0);
  assert.equal(log.sugerencias.length, 0);
});

test("generar: si faltan lavadores pide refuerzo voluntario a quien descansa ese día", async () => {
  const estado = trabajadores({
    1: { trabaja: false, plantilla: false }, 2: { trabaja: false, plantilla: false },
  });
  const { s, log } = crearServicio({ estado, probMatutino: 0, probVespertino: 0 });
  const r = await s.generar(s.manana());
  assert.equal(r.creadas, 1); // matutino necesita 2 y solo trabaja Eva: falta 1 (vespertino está completo)
  assert.deepEqual(log.sugerencias.map((x) => [x.idTrabajador, x.tipo]), [[1, "trabajar"]]);
});

test("responder: aceptar descansar crea la excepción 'descansa' de ese día y avisa al admin", async () => {
  const { s, log } = crearServicio();
  const sug = { id: 7, trabajador: { id: 1, nombre: "Ana Pérez" }, fecha: s.manana(), tipo: "descansar", estado: "pendiente" };
  s.model.findById = async () => sug;
  const r = await s.responder({ id: 1, rol: "trabajador" }, 7, { estado: "aceptada" });
  assert.equal(r.id, 7);
  assert.deepEqual(log.excepciones.map((e) => [e.idTrabajador, e.estado, e.origen]), [[1, "descansa", "sugerencia"]]);
  assert.deepEqual(log.respuestas, [[7, "aceptada"]]);
  assert.equal(log.notificaciones.at(-1).idUsuario, 99);
});

test("responder: no deja descansar si el turno quedaría con menos lavadores de los necesarios", async () => {
  // Matutino ya solo tiene 2 trabajando y se necesitan 2
  const estado = trabajadores({ 5: { trabaja: false } });
  const { s, log } = crearServicio({ estado });
  const sug = { id: 8, trabajador: { id: 1, nombre: "Ana Pérez" }, fecha: s.manana(), tipo: "descansar", estado: "pendiente" };
  s.model.findById = async () => sug;
  await assert.rejects(() => s.responder({ id: 1, rol: "trabajador" }, 8, { estado: "aceptada" }), /menos lavadores/);
  assert.equal(log.excepciones.length, 0);
  assert.deepEqual(log.respuestas, [[8, "expirada"]]);
});

test("responder: otro trabajador no puede responder una sugerencia ajena", async () => {
  const { s } = crearServicio();
  s.model.findById = async () => ({ id: 9, trabajador: { id: 1 }, fecha: s.manana(), tipo: "descansar", estado: "pendiente" });
  await assert.rejects(() => s.responder({ id: 2, rol: "trabajador" }, 9, { estado: "aceptada" }), /no es tuya/);
});

test("responder: rechazar no crea excepción", async () => {
  const { s, log } = crearServicio();
  const sug = { id: 10, trabajador: { id: 1 }, fecha: s.manana(), tipo: "descansar", estado: "pendiente" };
  s.model.findById = async () => sug;
  await s.responder({ id: 1, rol: "trabajador" }, 10, { estado: "rechazada" });
  assert.equal(log.excepciones.length, 0);
  assert.deepEqual(log.respuestas, [[10, "rechazada"]]);
});
