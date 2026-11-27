// Fase 13: pruebas del modelo de demanda con datos sintéticos (sin base de datos ni red).
// Se generan lavados con efectos CONOCIDOS (lluvia, quincena, citas agendadas) y se comprueba
// que el modelo los recupera y que le gana a las reglas en fechas que no vio.
import test from "node:test";
import assert from "node:assert/strict";
import {
  esFestivo, esQuincena, resolver, entrenarPoisson, predecirModelo, featuresCrudas,
  construirMuestras, entrenarYValidar, explicar, FEATURES,
} from "../src/utils/modeloDemanda.js";
import { estimarLavados } from "../src/utils/planificador.js";

// Generador aleatorio con semilla (resultados repetibles)
function rng(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function poisson(lambda, r) {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do { k++; p *= r(); } while (p > L);
  return k - 1;
}
const sumar = (f, n) => {
  const [y, m, d] = f.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
const diaDe = (f) => {
  const w = new Date(`${f}T00:00:00Z`).getUTCDay();
  return w === 0 ? 7 : w;
};

// Historial sintético: lunes a sábado, 30 semanas.
//   demanda real = base del día y turno x e^(-1.6 x lluvia) x 1.5 en quincena
//   la víspera ya estaban agendadas ~45 % de las citas
function historialSintetico({ semanas = 30, semilla = 7 } = {}) {
  const r = rng(semilla);
  const basePorDia = { 1: 4, 2: 4, 3: 5, 4: 5, 5: 7, 6: 10 };
  const fechas = [];
  const conteos = new Map();
  const clima = new Map();
  let f = "2026-01-05"; // lunes
  for (let i = 0; i < semanas * 7; i++, f = sumar(f, 1)) {
    const dia = diaDe(f);
    if (dia === 7) continue; // domingo cerrado
    fechas.push(f);
    const llueve = r() < 0.35;
    const probMat = Math.round(llueve ? 55 + r() * 45 : r() * 30);
    const probVesp = Math.round(llueve ? 55 + r() * 45 : r() * 30);
    clima.set(f, { probLluvia: Math.max(probMat, probVesp), probMatutino: probMat, probVespertino: probVesp,
      precipitacionMm: llueve ? r() * 12 : 0, tempMax: 20 + r() * 8 });
    for (const turno of ["matutino", "vespertino"]) {
      const prob = (turno === "matutino" ? probMat : probVesp) / 100;
      const lambda = basePorDia[dia] * (turno === "vespertino" ? 1.2 : 1) * Math.exp(-1.6 * prob)
        * (esQuincena(f) ? 1.5 : 1);
      const total = poisson(lambda, r);
      let agendadas = 0;
      for (let k = 0; k < total; k++) if (r() < 0.45) agendadas++;
      conteos.set(`${f}|${turno}`, { total, agendadas });
    }
  }
  return { fechas, conteos, clima };
}

test("festivos oficiales de México", () => {
  assert.equal(esFestivo("2026-01-01"), true);
  assert.equal(esFestivo("2026-02-02"), true);  // primer lunes de febrero
  assert.equal(esFestivo("2026-03-16"), true);  // tercer lunes de marzo
  assert.equal(esFestivo("2026-09-16"), true);
  assert.equal(esFestivo("2026-11-16"), true);  // tercer lunes de noviembre
  assert.equal(esFestivo("2026-11-20"), false); // ya no es festivo (se recorre al lunes)
  assert.equal(esFestivo("2030-10-01"), true);  // cambio de Poder Ejecutivo
  assert.equal(esFestivo("2026-10-01"), false);
});

test("quincena: 15, 16, último y primero del mes", () => {
  assert.equal(esQuincena("2026-11-15"), true);
  assert.equal(esQuincena("2026-11-30"), true);
  assert.equal(esQuincena("2026-02-28"), true);
  assert.equal(esQuincena("2026-12-01"), true);
  assert.equal(esQuincena("2026-11-20"), false);
});

test("resolver un sistema lineal", () => {
  const x = resolver([[2, 1], [1, 3]], [3, 5]);
  assert.ok(Math.abs(x[0] - 0.8) < 1e-9 && Math.abs(x[1] - 1.4) < 1e-9);
});

test("la regresión de Poisson recupera un efecto conocido", () => {
  const r = rng(3);
  const filas = [];
  const y = [];
  for (let i = 0; i < 3000; i++) {
    const prob = r() * 100;
    filas.push(featuresCrudas({ fecha: "2026-11-25", turno: "matutino", base: 5, probLluvia: prob, agendadas: 0 }));
    y.push(poisson(6 * Math.exp(-1.2 * (prob / 100)), r));
  }
  const m = entrenarPoisson(filas, y, { lambda: 0.01 });
  // coeficiente en unidades crudas = coeficiente estandarizado / desviación
  const j = FEATURES.indexOf("lluvia");
  const efectoCrudo = m.coeficientes[j] / m.desv[j];
  assert.ok(Math.abs(efectoCrudo - -1.2) < 0.15, `esperado ≈ -1.2, obtenido ${efectoCrudo}`);
  const sinLluvia = predecirModelo(m, featuresCrudas({ fecha: "2026-11-25", turno: "matutino", base: 5, probLluvia: 0, agendadas: 0 }));
  assert.ok(Math.abs(sinLluvia - 6) < 0.5, `esperado ≈ 6, obtenido ${sinLluvia}`);
});

test("con datos sintéticos el modelo le gana a las reglas y se activa", () => {
  const { fechas, conteos, clima } = historialSintetico();
  const muestras = construirMuestras({ conteos, fechas, clima, semanas: 8 });
  assert.ok(muestras.length > 250);
  const r = entrenarYValidar(muestras, { minMuestras: 112 });
  assert.equal(r.activo, true, r.motivo);
  assert.ok(r.maeModelo < r.maeReglas, `modelo ${r.maeModelo} vs reglas ${r.maeReglas}`);

  const efectos = Object.fromEntries(explicar(r.modelo).map((e) => [e.variable, e.factor]));
  assert.ok(efectos.lluvia < 1, "la lluvia debe bajar la demanda");
  assert.ok(efectos.quincena > 1, "la quincena debe subirla");
  assert.ok(efectos.agendadas > 1, "más citas agendadas, más lavados");
});

test("con pocos datos el modelo se guarda pero NO se activa", () => {
  const { fechas, conteos, clima } = historialSintetico({ semanas: 6 });
  const r = entrenarYValidar(construirMuestras({ conteos, fechas, clima, semanas: 8 }), { minMuestras: 112 });
  assert.equal(r.activo, false);
  assert.match(r.motivo, /pocos datos|Faltan datos/);
});

test("estimarLavados usa el modelo si hay uno activo y las reglas si no", () => {
  const { fechas, conteos, clima } = historialSintetico();
  const { modelo } = entrenarYValidar(construirMuestras({ conteos, fechas, clima, semanas: 8 }));
  const comun = { historico: 40, semanas: 8, demandaBase: 6, probLluvia: 90 };
  const contexto = { fecha: "2026-11-27", turno: "matutino", precipitacionMm: 8, tempMax: 21, agendadas: 2 };

  const conModelo = estimarLavados({ ...comun, modelo, contexto });
  assert.equal(conModelo.metodo, "modelo-v1");
  assert.ok(conModelo.estimado > 0);

  assert.equal(estimarLavados(comun).metodo, "reglas-v1");
  // Sin historial suficiente se queda con la demanda base aunque haya modelo
  assert.equal(estimarLavados({ ...comun, semanas: 2, modelo, contexto }).metodo, "reglas-v1");
});
