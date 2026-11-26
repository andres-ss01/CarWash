import test from "node:test";
import assert from "node:assert/strict";
import {
  factorLluvia, estimarLavados, lavadoresNecesarios, elegirDescansos, elegirRefuerzos, contarPorTurno,
} from "../src/utils/planificador.js";
import { parsearOpenMeteo } from "../src/utils/clima.js";

test("factorLluvia: más lluvia, menos demanda; sin dato no cambia nada", () => {
  assert.equal(factorLluvia(null), 1);
  assert.equal(factorLluvia(10), 1);
  assert.equal(factorLluvia(45), 0.85);
  assert.equal(factorLluvia(65), 0.65);
  assert.equal(factorLluvia(90), 0.5);
});

test("estimarLavados: usa base mientras haya menos de 3 semanas de historial", () => {
  const frio = estimarLavados({ historico: 30, semanas: 2, demandaBase: 6, probLluvia: 0 });
  assert.equal(frio.estimado, 6);
  assert.equal(frio.conHistorial, false);
  const conHist = estimarLavados({ historico: 40, semanas: 4, demandaBase: 6, probLluvia: 90 });
  assert.equal(conHist.base, 10);
  assert.equal(conHist.estimado, 5); // 10 * 0.5
});

test("lavadoresNecesarios: redondea hacia arriba y respeta el mínimo", () => {
  assert.equal(lavadoresNecesarios(10, 5, 2), 2);
  assert.equal(lavadoresNecesarios(10.1, 5, 2), 3);
  assert.equal(lavadoresNecesarios(1, 5, 2), 2);
});

const cuatro = [
  { id: 1, turno: "matutino" }, { id: 2, turno: "matutino" },
  { id: 3, turno: "vespertino" }, { id: 4, turno: "vespertino" },
];

test("elegirDescansos: no baja del mínimo de cada turno", () => {
  const r = elegirDescansos({
    programados: [...cuatro, { id: 5, turno: "matutino" }],
    necesarios: { matutino: 2, vespertino: 2 },
    prob: { matutino: 80, vespertino: 80 },
    umbral: 60,
  });
  assert.deepEqual(r, [1]); // matutino tenía 3 y necesita 2 -> solo 1 descansa; vespertino queda justo
});

test("elegirDescansos: sin lluvia suficiente o sin dato no sugiere nada", () => {
  const base = { programados: cuatro, necesarios: { matutino: 1, vespertino: 1 }, umbral: 60 };
  assert.deepEqual(elegirDescansos({ ...base, prob: { matutino: 20, vespertino: 30 } }), []);
  assert.deepEqual(elegirDescansos({ ...base, prob: { matutino: null, vespertino: null } }), []);
});

test("elegirDescansos: solo el turno con lluvia; el otro no se toca", () => {
  const r = elegirDescansos({
    programados: cuatro, necesarios: { matutino: 1, vespertino: 1 },
    prob: { matutino: 10, vespertino: 90 }, umbral: 60,
  });
  assert.deepEqual(r, [3]); // vespertino: 2 -> 1; matutino sin lluvia
});

test("elegirDescansos: reparte con justicia (quien menos descansos lleva, primero)", () => {
  const r = elegirDescansos({
    programados: cuatro, necesarios: { matutino: 1, vespertino: 1 },
    prob: { matutino: 90, vespertino: 90 }, umbral: 60,
    descansosRecientes: new Map([[1, 3], [2, 0], [3, 2], [4, 0]]),
  });
  assert.deepEqual(r, [2, 4]);
});

test("elegirDescansos: un mixto solo descansa si los dos turnos lo permiten", () => {
  const programados = [{ id: 1, turno: "mixto" }, { id: 2, turno: "matutino" }, { id: 3, turno: "vespertino" }];
  const r = elegirDescansos({
    programados, necesarios: { matutino: 1, vespertino: 1 },
    prob: { matutino: 90, vespertino: 90 }, umbral: 60,
  });
  assert.deepEqual(r, [1]); // mixto sale; quedan 1 matutino y 1 vespertino
  const r2 = elegirDescansos({
    programados, necesarios: { matutino: 1, vespertino: 2 },
    prob: { matutino: 90, vespertino: 90 }, umbral: 60,
  });
  assert.deepEqual(r2, [2]); // el mixto no puede (vespertino quedaría con 1 de 2); el matutino sí
});

test("elegirDescansos: respeta la lista de elegibles pero cuenta a todos los programados", () => {
  const r = elegirDescansos({
    programados: cuatro, necesarios: { matutino: 1, vespertino: 1 },
    prob: { matutino: 90, vespertino: 90 }, umbral: 60, elegibles: new Set([2]),
  });
  assert.deepEqual(r, [2]);
});

test("elegirRefuerzos: pide solo a quien cubre el turno que falta", () => {
  const r = elegirRefuerzos({
    programados: [{ id: 1, turno: "matutino" }],
    libres: [{ id: 7, turno: "vespertino" }, { id: 8, turno: "matutino" }],
    necesarios: { matutino: 2, vespertino: 0 },
  });
  assert.deepEqual(r, [8]);
});

test("contarPorTurno: el mixto cuenta en ambos", () => {
  assert.deepEqual(contarPorTurno([{ id: 1, turno: "mixto" }, { id: 2, turno: "matutino" }]), { matutino: 2, vespertino: 1 });
});

test("parsearOpenMeteo: probabilidad máxima por turno y días pasados como observados", () => {
  const horas = [];
  const probs = [];
  for (let h = 0; h < 24; h++) {
    horas.push(`2026-11-27T${String(h).padStart(2, "0")}:00`);
    probs.push(h === 9 ? 30 : h === 16 ? 85 : 5);
  }
  const json = {
    daily: {
      time: ["2026-11-25", "2026-11-27"],
      precipitation_probability_max: [null, 85],
      precipitation_sum: [1.2, 6.4],
      temperature_2m_max: [24, 21.5],
      wind_speed_10m_max: [10, 18],
    },
    hourly: { time: horas, precipitation_probability: probs },
  };
  const [ayer, manana] = parsearOpenMeteo(json, { matutino: [8, 14], vespertino: [14, 20] }, "2026-11-26");
  assert.equal(ayer.observado, true);
  assert.equal(ayer.probLluvia, null);
  assert.equal(ayer.probMatutino, null); // sin datos por hora ese día
  assert.equal(manana.observado, false);
  assert.equal(manana.probLluvia, 85);
  assert.equal(manana.probMatutino, 30);
  assert.equal(manana.probVespertino, 85);
  assert.equal(manana.tempMax, 21.5);
});
