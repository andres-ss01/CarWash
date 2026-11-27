// Historial simulado (scripts/simular_historial.js) sin base de datos: genera los datos, los convierte en
// muestras igual que ModeloService.datos() y comprueba que el modelo se activa y encuentra los efectos.
import test from "node:test";
import assert from "node:assert/strict";
import { simularHistorial, sumarDias, diaSemana } from "../src/utils/simulacion.js";
import { construirMuestras, entrenarYValidar, explicar } from "../src/utils/modeloDemanda.js";
import ModeloService from "../src/services/ModeloService.js";

const ventanas = { matutino: [8, 14], vespertino: [14, 20] };
// Lunes a sábado de 8 a 18 (sábado hasta 16), domingo cerrado: como el seed
const horarios = new Map([1, 2, 3, 4, 5, 6].map((d) => [d, { apertura: 480, cierre: d === 6 ? 960 : 1080 }]));

function aMuestras({ citas, clima }, desde, hasta) {
  const conteos = new Map();
  for (const c of citas) {
    if (c.estado === "cancelada" || c.estado === "no_asistio") continue;
    const fecha = c.inicio.slice(0, 10);
    const turno = ModeloService.turnoDeHora(Number(c.inicio.slice(11, 13)), ventanas);
    const corte = `${sumarDias(fecha, -1)} 18:00:00`;
    const k = `${fecha}|${turno}`;
    const v = conteos.get(k) || { total: 0, agendadas: 0 };
    v.total++;
    if (c.creacion < corte) v.agendadas++;
    conteos.set(k, v);
  }
  const fechas = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) if (horarios.has(diaSemana(f))) fechas.push(f);
  return construirMuestras({ conteos, fechas, clima: new Map(clima.map((c) => [c.fecha, c])) });
}

test("la simulación respeta horarios, días cerrados y marca bien las fechas", () => {
  const { citas, clima } = simularHistorial({ desde: "2026-06-01", hasta: "2026-06-30", horarios, ventanas, semilla: 1 });
  assert.equal(clima.length, 30);
  assert.ok(citas.length > 100);
  for (const c of citas) {
    assert.notEqual(diaSemana(c.inicio.slice(0, 10)), 7, "no hay citas en domingo");
    assert.ok(c.fin > c.inicio);
    assert.ok(c.creacion < c.inicio, "se agenda antes de que empiece");
    const hora = Number(c.inicio.slice(11, 13));
    assert.ok(hora >= 8 && hora < 18);
  }
});

test("es reproducible con la misma semilla", () => {
  const a = simularHistorial({ desde: "2026-03-02", hasta: "2026-03-15", horarios, ventanas, semilla: 9 });
  const b = simularHistorial({ desde: "2026-03-02", hasta: "2026-03-15", horarios, ventanas, semilla: 9 });
  assert.deepEqual(a, b);
});

test("con 16 semanas simuladas el modelo se activa y encuentra la lluvia y la quincena", () => {
  const desde = "2026-06-01";
  const hasta = sumarDias(desde, 16 * 7 - 1);
  const muestras = aMuestras(simularHistorial({ desde, hasta, horarios, ventanas, semilla: 42 }), desde, hasta);
  const r = entrenarYValidar(muestras, { minMuestras: 112 });
  assert.equal(r.activo, true, r.motivo);
  assert.ok(r.maeModelo < r.maeReglas, `modelo ${r.maeModelo} vs reglas ${r.maeReglas}`);
  const f = Object.fromEntries(explicar(r.modelo).map((e) => [e.variable, e.factor]));
  assert.ok(f.lluvia < 1, "la lluvia baja la demanda");
  assert.ok(f.quincena > 1, "la quincena la sube");
});
