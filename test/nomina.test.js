// Pago semanal de los trabajadores (sin base de datos)
import test from "node:test";
import assert from "node:assert/strict";
import { calcularSemana } from "../src/utils/nomina.js";
import { lunesDe } from "../src/services/NominaService.js";

const semana = (estados) => estados.map((estado, i) => ({ fecha: `2026-11-${String(23 + i).padStart(2, "0")}`, estado }));

test("días trabajados = pago completo; descanso por clima aceptado = medio pago", () => {
  const r = calcularSemana({
    dias: semana(["trabaja", "trabaja", "descansa_clima", "trabaja", "ausente", "trabaja_extra", "descansa"]),
    pagoDia: 300,
    hoy: "2026-12-31",
  });
  assert.equal(r.diasCompletos, 4);
  assert.equal(r.diasMedios, 1);
  assert.equal(r.total, 4 * 300 + 150);
  assert.deepEqual(r.detalle.map((d) => d.factor), [1, 1, 0.5, 1, 0, 1, 0]);
});

test("los días que el negocio cierra no se pagan; descanso del admin tampoco", () => {
  const r = calcularSemana({
    dias: semana(["trabaja", "descansa_puntual", "trabaja", "trabaja", "trabaja", "trabaja", "trabaja"]),
    cerrados: new Set(["2026-11-29"]),
    pagoDia: 250.5,
    hoy: "2026-12-31",
  });
  assert.equal(r.diasCompletos, 5);
  assert.equal(r.total, 1252.5);
  assert.equal(r.detalle[6].estado, "cerrado");
});

test("a mitad de semana se separa lo ganado hasta hoy de lo proyectado", () => {
  const r = calcularSemana({ dias: semana(Array(7).fill("trabaja")), pagoDia: 100, hoy: "2026-11-25" });
  assert.equal(r.totalHastaHoy, 300); // lunes, martes y miércoles
  assert.equal(r.total, 700);
  assert.equal(r.detalle[3].futuro, true);
});

test("lunesDe devuelve el lunes de la semana", () => {
  assert.equal(lunesDe("2026-11-26"), "2026-11-23");
  assert.equal(lunesDe("2026-11-23"), "2026-11-23");
  assert.equal(lunesDe("2026-11-29"), "2026-11-23");
});
