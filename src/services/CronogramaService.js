// =============================================================================
// src/services/CronogramaService.js - Cronograma semanal de trabajadores
// -----------------------------------------------------------------------------
//   Plantilla  : qué días de la semana trabaja cada uno (la edita el administrador)
//   Excepción  : un cambio para una fecha (descansa / trabaja / ausente solo hoy)
// La plantilla no se toca cuando alguien acepta una sugerencia: solo se crea la excepción.
// =============================================================================

import Cronograma from "../models/Cronograma.js";
import Usuario from "../models/Usuario.js";
import Horario from "../models/Horario.js";
import Demanda from "../models/Demanda.js";
import Notificacion from "../models/Notificacion.js";
import Sugerencia from "../models/Sugerencia.js";
import AppError from "../utils/AppError.js";
import { ROLES, esAdmin } from "../utils/permisos.js";
import { parseId, requireInt, requireEnum, optionalString } from "../utils/validators.js";
import {
  parseFechaHora, formatFecha, addMinutes, diaSemana, ahoraLocal, hoyLocal, fechaLegible,
} from "../utils/fechas.js";

const ESTADOS_EXCEPCION = ["descansa", "trabaja", "ausente"];

// "YYYY-MM-DD" válida (acepta también "YYYY-MM-DD HH:mm" y se queda con la fecha)
export function normalizarFecha(valor, nombre = "fecha") {
  return formatFecha(parseFechaHora(valor, nombre));
}

export default class CronogramaService {
  constructor() {
    this.model = new Cronograma();
    this.usuarioModel = new Usuario();
    this.horarioModel = new Horario();
    this.demandaModel = new Demanda();
    this.notificacionModel = new Notificacion();
    this.sugerenciaModel = new Sugerencia();
  }

  async exigirTrabajador(id) {
    const t = await this.usuarioModel.findById(parseId(id, "idTrabajador"));
    if (!t || t.rol !== ROLES.TRABAJADOR) throw new AppError("Trabajador no encontrado", 404);
    return t;
  }

  async avisarAdmins(mensaje) {
    const admins = await this.usuarioModel.findAll({ rol: ROLES.ADMIN, activo: true });
    for (const a of admins) await this.notificacionModel.create(a.id, null, mensaje);
  }

  // GET /api/cronograma?semana=YYYY-MM-DD  (cualquier día de la semana; por omisión, la actual)
  async getSemana(actor, query) {
    const ref = query?.semana ? parseFechaHora(normalizarFecha(query.semana, "semana")) : parseFechaHora(hoyLocal());
    const lunes = addMinutes(ref, -(diaSemana(ref) - 1) * 1440);
    const dias = Array.from({ length: 7 }, (_, i) => formatFecha(addMinutes(lunes, i * 1440)));

    let trabajadores = await this.usuarioModel.findAll({ rol: ROLES.TRABAJADOR, activo: true });
    if (!esAdmin(actor)) trabajadores = trabajadores.filter((t) => t.id === actor.id); // cada quien ve lo suyo

    const [plantillas, excepciones, horarios, predicciones] = await Promise.all([
      this.model.plantillas(),
      this.model.excepcionesEntre(dias[0], dias[6]),
      this.horarioModel.findAll(),
      this.demandaModel.findPrediccionesEntre(dias[0], dias[6]),
    ]);
    const abre = new Set(horarios.map((h) => h.dia));
    const plantilla = new Map(plantillas.map((p) => [`${p.idTrabajador}-${p.dia_semana}`, Boolean(p.trabaja)]));
    const excepcion = new Map(excepciones.map((e) => [`${e.idTrabajador}-${e.fecha}`, e]));

    const filas = trabajadores.map((t) => ({
      id: t.id,
      nombre: `${t.nombre} ${t.apellidos}`,
      turno: t.perfil.turno,
      plantilla: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((d) => [d, plantilla.get(`${t.id}-${d}`) ?? true])),
      dias: dias.map((fecha, i) => {
        const dia = i + 1;
        const trabajaPlantilla = plantilla.get(`${t.id}-${dia}`) ?? true;
        const e = excepcion.get(`${t.id}-${fecha}`);
        let estado;
        if (e) {
          if (e.estado === "ausente") estado = "ausente";
          else if (e.estado === "trabaja") estado = "trabaja_extra";
          else estado = e.origen === "sugerencia" ? "descansa_clima" : "descansa_puntual";
        } else {
          estado = trabajaPlantilla ? "trabaja" : "descansa";
        }
        return { fecha, dia, estado, excepcion: e ? { origen: e.origen, nota: e.nota } : null };
      }),
    }));

    const resultado = { desde: dias[0], hasta: dias[6], dias: dias.map((fecha, i) => ({ fecha, dia: i + 1, cerrado: !abre.has(i + 1) })), trabajadores: filas };

    if (esAdmin(actor)) {
      // "Vienen": cuántos lavadores trabajan cada día y cuántos se necesitan según la predicción
      resultado.resumen = dias.map((fecha, i) => {
        const turnoNec = Object.fromEntries(
          predicciones.filter((p) => p.fecha === fecha).map((p) => [p.turno, p.trabajadores_necesarios]));
        return {
          fecha,
          cerrado: !abre.has(i + 1),
          vienen: filas.filter((f) => ["trabaja", "trabaja_extra"].includes(f.dias[i].estado)).length,
          necesarios: turnoNec,
        };
      });
    }
    return resultado;
  }

  // PUT /api/cronograma/:idTrabajador/:dia   { trabaja: true|false }
  async setPlantilla(idTrabajador, dia, body) {
    const t = await this.exigirTrabajador(idTrabajador);
    const diaNum = requireInt(dia, "dia", { min: 1, max: 7 });
    if (typeof body?.trabaja !== "boolean") throw new AppError("trabaja debe ser true o false", 400);
    await this.model.upsertPlantilla(t.id, diaNum, body.trabaja);
    return { idTrabajador: t.id, dia: diaNum, trabaja: body.trabaja };
  }

  exigirNoPasada(fecha) {
    if (fecha < hoyLocal()) throw new AppError("No se puede modificar un día que ya pasó", 400);
  }

  // PUT /api/cronograma/:idTrabajador/excepciones/:fecha   { estado, nota? }   (administrador)
  async setExcepcion(actor, idTrabajador, fechaParam, body) {
    const t = await this.exigirTrabajador(idTrabajador);
    const fecha = normalizarFecha(fechaParam);
    this.exigirNoPasada(fecha);
    const estado = requireEnum(body?.estado, "estado", ESTADOS_EXCEPCION);
    const nota = optionalString(body?.nota, "nota", { max: 120 });
    await this.model.upsertExcepcion({ idTrabajador: t.id, fecha, estado, origen: "admin", nota });
    await this.sugerenciaModel.expirarDelTrabajador(t.id, fecha); // la decisión del admin reemplaza a la sugerencia
    return { idTrabajador: t.id, fecha, estado, origen: "admin", nota };
  }

  // DELETE /api/cronograma/:idTrabajador/excepciones/:fecha  (vuelve a regir la plantilla)
  async quitarExcepcion(idTrabajador, fechaParam) {
    const t = await this.exigirTrabajador(idTrabajador);
    const fecha = normalizarFecha(fechaParam);
    this.exigirNoPasada(fecha);
    if (!(await this.model.deleteExcepcion(t.id, fecha))) throw new AppError("Ese día no tiene excepción", 404);
    return { message: "Excepción eliminada: vuelve a regir la plantilla", idTrabajador: t.id, fecha };
  }

  // POST /api/cronograma/ausencia   { fecha?, idTrabajador? (solo admin), nota? }
  // "Ausente solo hoy": por omisión es hoy. No cambia la plantilla semanal.
  async registrarAusencia(actor, body) {
    const esAdm = esAdmin(actor);
    const idTrabajador = esAdm ? body?.idTrabajador : actor.id;
    if (!idTrabajador) throw new AppError("Indica idTrabajador", 400);
    const t = await this.exigirTrabajador(idTrabajador);
    const fecha = body?.fecha ? normalizarFecha(body.fecha) : hoyLocal();
    this.exigirNoPasada(fecha);
    const nota = optionalString(body?.nota, "nota", { max: 120 });

    await this.model.upsertExcepcion({ idTrabajador: t.id, fecha, estado: "ausente", origen: esAdm ? "admin" : "trabajador", nota });
    await this.sugerenciaModel.expirarDelTrabajador(t.id, fecha);
    await this.avisarAdmins(`${t.nombre} ${t.apellidos} estará ausente el ${fechaLegible(fecha)}.`);
    return { idTrabajador: t.id, fecha, estado: "ausente" };
  }

  // DELETE /api/cronograma/ausencia/:fecha?idTrabajador=  — cancela una ausencia registrada
  async quitarAusencia(actor, fechaParam, query) {
    const idTrabajador = esAdmin(actor) ? query?.idTrabajador : actor.id;
    if (!idTrabajador) throw new AppError("Indica idTrabajador", 400);
    const t = await this.exigirTrabajador(idTrabajador);
    const fecha = normalizarFecha(fechaParam);
    this.exigirNoPasada(fecha);
    const e = await this.model.findExcepcion(t.id, fecha);
    if (!e || e.estado !== "ausente") throw new AppError("Ese día no tiene una ausencia registrada", 404);
    await this.model.deleteExcepcion(t.id, fecha);
    return { message: "Ausencia cancelada", idTrabajador: t.id, fecha };
  }
}
