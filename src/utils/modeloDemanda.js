// =============================================================================
// src/utils/modeloDemanda.js - Modelo de machine learning de la demanda (Fase 13)
// -----------------------------------------------------------------------------
// Predice cuántos lavados habrá en una fecha y turno con una REGRESIÓN DE POISSON
// (modelo lineal generalizado con enlace logarítmico y regularización L2), entrenada con
// el historial de citas y el clima. Se eligió Poisson porque:
//   - lo que se predice es un CONTEO (0, 1, 2, ... lavados), nunca negativo;
//   - los efectos son multiplicativos ("la lluvia baja la demanda un 35 %"), igual que las reglas;
//   - con pocos meses de datos un modelo simple y regularizado generaliza mejor que uno complejo;
//   - cada coeficiente se puede explicar (ver `explicar`).
//
// Todo aquí es puro (sin base de datos ni red) para poder probarlo con `npm test`.
// =============================================================================

import { factorLluvia } from "./planificador.js";

export const VERSION = "poisson-v1";
export const METODO = "modelo-v1";

// Variables de entrada (features). El orden importa: es el de los coeficientes guardados.
export const FEATURES = [
  "base",          // log(1 + promedio histórico del mismo día de la semana y turno)
  "vespertino",    // 1 = turno de la tarde
  "lluvia",        // probabilidad de lluvia del turno (0..1), del pronóstico
  "precipitacion", // log(1 + mm de lluvia pronosticados)
  "temperatura",   // temperatura máxima (°C)
  "agendadas",     // log(1 + citas ya agendadas la víspera a las 18:00)
  "finDeSemana",   // sábado o domingo
  "quincena",      // día de pago (15, 16, último y primero del mes)
  "festivo",       // día festivo oficial en México
];

const ETIQUETAS = {
  base: "historial del mismo día",
  vespertino: "turno de la tarde",
  lluvia: "probabilidad de lluvia",
  precipitacion: "lluvia pronosticada (mm)",
  temperatura: "temperatura máxima",
  agendadas: "citas ya agendadas",
  finDeSemana: "fin de semana",
  quincena: "quincena",
  festivo: "día festivo",
};

// ---------------------------------------------------------------------------
// Calendario
// ---------------------------------------------------------------------------
const partes = (fecha) => fecha.split("-").map(Number); // "2026-11-27" -> [2026, 11, 27]
const diaSemanaDe = (fecha) => {
  const [y, m, d] = partes(fecha);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return w === 0 ? 7 : w; // 1 = lunes ... 7 = domingo
};
const ultimoDiaDelMes = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// n-ésimo lunes del mes (n = 1, 2, 3...)
function nesimoLunes(y, m, n) {
  const primero = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0 = domingo
  const offset = (8 - primero) % 7; // días hasta el primer lunes
  return 1 + offset + (n - 1) * 7;
}

// Descansos obligatorios de la Ley Federal del Trabajo (art. 74)
export function esFestivo(fecha) {
  const [y, m, d] = partes(fecha);
  if ((m === 1 && d === 1) || (m === 5 && d === 1) || (m === 9 && d === 16) || (m === 12 && d === 25)) return true;
  if (m === 2 && d === nesimoLunes(y, 2, 1)) return true;  // Constitución
  if (m === 3 && d === nesimoLunes(y, 3, 3)) return true;  // Natalicio de Benito Juárez
  if (m === 11 && d === nesimoLunes(y, 11, 3)) return true; // Revolución
  if (m === 10 && d === 1 && (y - 2024) % 6 === 0) return true; // cambio de Poder Ejecutivo
  return false;
}

// Días de quincena: la gente cobra el 15 y el último día del mes
export function esQuincena(fecha) {
  const [y, m, d] = partes(fecha);
  return d === 15 || d === 16 || d === 1 || d >= ultimoDiaDelMes(y, m);
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------
const numOrNull = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);

// Vector "crudo" (sin estandarizar). Los datos que falten van como null y luego se imputan con la media.
export function featuresCrudas({ fecha, turno, base, probLluvia, precipitacionMm, tempMax, agendadas }) {
  const dia = diaSemanaDe(fecha);
  const prob = numOrNull(probLluvia);
  const precip = numOrNull(precipitacionMm);
  return [
    Math.log1p(Math.max(0, base ?? 0)),
    turno === "vespertino" ? 1 : 0,
    prob === null ? null : prob / 100,
    precip === null ? null : Math.log1p(Math.max(0, precip)),
    numOrNull(tempMax),
    Math.log1p(Math.max(0, agendadas ?? 0)),
    dia >= 6 ? 1 : 0,
    esQuincena(fecha) ? 1 : 0,
    esFestivo(fecha) ? 1 : 0,
  ];
}

// ---------------------------------------------------------------------------
// Álgebra: resolver A·x = b (eliminación de Gauss con pivoteo parcial)
// ---------------------------------------------------------------------------
export function resolver(A, b) {
  const n = b.length;
  const M = A.map((fila, i) => [...fila, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) throw new Error("Sistema singular");
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
    x[r] = s / M[r][r];
  }
  return x;
}

// ---------------------------------------------------------------------------
// Entrenamiento: regresión de Poisson con IRLS (mínimos cuadrados reponderados) + L2
// ---------------------------------------------------------------------------
function estandarizar(filasCrudas) {
  const p = filasCrudas[0].length;
  const medias = [];
  const desv = [];
  for (let j = 0; j < p; j++) {
    const vals = filasCrudas.map((f) => f[j]).filter((v) => v !== null);
    const m = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    const v = vals.length ? vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length : 0;
    medias.push(m);
    desv.push(Math.sqrt(v) > 1e-9 ? Math.sqrt(v) : 1);
  }
  return { medias, desv };
}

const transformar = (cruda, medias, desv) => cruda.map((v, j) => (v === null ? 0 : (v - medias[j]) / desv[j]));

const LIMITE_ETA = 8; // exp(8) ≈ 3000 lavados: evita desbordes numéricos

/**
 * Entrena el modelo.
 *   filas: vectores de featuresCrudas()   y: lavados observados
 *   lambda: fuerza de la regularización L2 (más alto = coeficientes más pequeños, menos sobreajuste)
 */
export function entrenarPoisson(filas, y, { lambda = 2, iteraciones = 50, tolerancia = 1e-8 } = {}) {
  if (!filas.length) throw new Error("Sin datos para entrenar");
  const { medias, desv } = estandarizar(filas);
  const X = filas.map((f) => [1, ...transformar(f, medias, desv)]); // columna 0 = intercepto
  const p = X[0].length;
  const media = y.reduce((a, b) => a + b, 0) / y.length;
  let beta = new Array(p).fill(0);
  beta[0] = Math.log(Math.max(media, 0.1));

  let iter = 0;
  for (; iter < iteraciones; iter++) {
    const A = Array.from({ length: p }, () => new Array(p).fill(0));
    const b = new Array(p).fill(0);
    for (let i = 0; i < X.length; i++) {
      const eta = Math.max(-LIMITE_ETA, Math.min(LIMITE_ETA, X[i].reduce((s, x, j) => s + x * beta[j], 0)));
      const mu = Math.exp(eta);
      const z = eta + (y[i] - mu) / mu; // respuesta de trabajo
      for (let j = 0; j < p; j++) {
        b[j] += X[i][j] * mu * z;
        for (let k = j; k < p; k++) A[j][k] += X[i][j] * mu * X[i][k];
      }
    }
    for (let j = 0; j < p; j++) {
      for (let k = 0; k < j; k++) A[j][k] = A[k][j];
      if (j > 0) A[j][j] += lambda; // el intercepto no se penaliza
    }
    const nuevo = resolver(A, b);
    const cambio = Math.max(...nuevo.map((v, j) => Math.abs(v - beta[j])));
    beta = nuevo;
    if (cambio < tolerancia) break;
  }

  return {
    version: VERSION,
    metodo: METODO,
    features: [...FEATURES],
    intercepto: beta[0],
    coeficientes: beta.slice(1),
    medias,
    desv,
    lambda,
    iteraciones: iter + 1,
  };
}

/** Lavados esperados (la media de la Poisson) para un vector crudo. */
export function predecirModelo(modelo, cruda) {
  const z = transformar(cruda, modelo.medias, modelo.desv);
  const eta = modelo.intercepto + z.reduce((s, v, j) => s + v * modelo.coeficientes[j], 0);
  return Math.exp(Math.max(-LIMITE_ETA, Math.min(LIMITE_ETA, eta)));
}

/**
 * Efecto de cada variable, en palabras: cuánto multiplica la demanda al pasar de "no" a "sí"
 * (binarias) o al subir una desviación estándar (continuas). Sirve para explicar el modelo.
 */
export function explicar(modelo) {
  const binarias = new Set(["vespertino", "finDeSemana", "quincena", "festivo"]);
  return modelo.features.map((nombre, j) => {
    const paso = binarias.has(nombre) ? 1 / modelo.desv[j] : 1; // en unidades estandarizadas
    const factor = Math.exp(modelo.coeficientes[j] * paso);
    const pct = Math.round((factor - 1) * 100);
    const cuando = binarias.has(nombre) ? `en ${ETIQUETAS[nombre]}` : `con más ${ETIQUETAS[nombre]}`;
    return {
      variable: nombre,
      coeficiente: Number(modelo.coeficientes[j].toFixed(4)),
      factor: Number(factor.toFixed(3)),
      texto: `${cuando}: ${pct >= 0 ? "+" : ""}${pct}% de lavados`,
    };
  });
}

// ---------------------------------------------------------------------------
// Datos de entrenamiento
// ---------------------------------------------------------------------------

/**
 * Arma una muestra por (fecha abierta, turno) con lo que se sabía LA VÍSPERA:
 *   conteos:  Map "fecha|turno" -> { total, agendadas }   (citas reales y agendadas antes del corte)
 *   fechas:   fechas en que el negocio abrió, ordenadas ("YYYY-MM-DD"), solo pasadas
 *   clima:    Map fecha -> { probLluvia, probMatutino, probVespertino, precipitacionMm, tempMax }
 *   semanas:  semanas de historial que se promedian (igual que las reglas)
 * Solo se usan las fechas con al menos 3 semanas de historial previo (como las reglas).
 */
export function construirMuestras({ conteos, fechas, clima, semanas = 8, turnos = ["matutino", "vespertino"] }) {
  const muestras = [];
  const primera = fechas[0];
  for (const fecha of fechas) {
    const dia = diaSemanaDe(fecha);
    const desde = sumar(fecha, -7 * semanas);
    const previas = fechas.filter((f) => f < fecha && f >= desde && f >= primera && diaSemanaDe(f) === dia);
    // Igual que las reglas: semanas observadas = cuántos días de ese tipo hubo en la ventana
    const semanasObs = contarDiasSemana(desde > primera ? desde : primera, fecha, dia);
    if (semanasObs < 3) continue;
    const c = clima.get(fecha) || {};
    for (const turno of turnos) {
      const historico = previas.reduce((s, f) => s + (conteos.get(`${f}|${turno}`)?.total || 0), 0);
      const base = historico / semanasObs;
      const probTurno = (turno === "matutino" ? c.probMatutino : c.probVespertino) ?? c.probLluvia ?? null;
      const actual = conteos.get(`${fecha}|${turno}`) || { total: 0, agendadas: 0 };
      muestras.push({
        fecha,
        turno,
        y: actual.total,
        base,
        probLluvia: probTurno,
        cruda: featuresCrudas({
          fecha, turno, base, probLluvia: probTurno,
          precipitacionMm: c.precipitacionMm, tempMax: c.tempMax, agendadas: actual.agendadas,
        }),
      });
    }
  }
  return muestras;
}

function sumar(fecha, dias) {
  const [y, m, d] = partes(fecha);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
}

// Cuántos días `dia` (1..7) hay en [desde, hasta)
function contarDiasSemana(desde, hasta, dia) {
  let n = 0;
  for (let f = desde; f < hasta; f = sumar(f, 1)) if (diaSemanaDe(f) === dia) n++;
  return n;
}

const mae = (pares) => pares.reduce((s, [p, y]) => s + Math.abs(p - y), 0) / pares.length;

/**
 * Entrena y valida contra las reglas actuales (reglas-v1) con un corte temporal:
 * se entrena con lo más viejo y se mide con las últimas fechas (como pasaría en la vida real).
 * Si el modelo no gana a las reglas, NO se activa. Al final se reentrena con todos los datos.
 */
export function entrenarYValidar(muestras, { lambda = 2, proporcionPrueba = 0.25, minMuestras = 112 } = {}) {
  const ordenadas = [...muestras].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  const resumen = { muestras: ordenadas.length, minMuestras };
  if (ordenadas.length < 20) {
    return { ...resumen, activo: false, modelo: null, motivo: `Faltan datos: hay ${ordenadas.length} turnos con historial y se necesitan al menos ${minMuestras}.` };
  }

  const fechasUnicas = [...new Set(ordenadas.map((m) => m.fecha))];
  const corte = fechasUnicas[Math.floor(fechasUnicas.length * (1 - proporcionPrueba))];
  const train = ordenadas.filter((m) => m.fecha < corte);
  const prueba = ordenadas.filter((m) => m.fecha >= corte);

  const modeloPrueba = entrenarPoisson(train.map((m) => m.cruda), train.map((m) => m.y), { lambda });
  const maeModelo = mae(prueba.map((m) => [predecirModelo(modeloPrueba, m.cruda), m.y]));
  const maeReglas = mae(prueba.map((m) => [m.base * factorLluvia(m.probLluvia), m.y]));
  const mejora = maeReglas > 0 ? (maeReglas - maeModelo) / maeReglas : 0;

  const modelo = entrenarPoisson(ordenadas.map((m) => m.cruda), ordenadas.map((m) => m.y), { lambda });
  const suficientes = ordenadas.length >= minMuestras;
  const gana = maeModelo < maeReglas;
  let motivo;
  if (!suficientes) motivo = `Aún son pocos datos (${ordenadas.length} de ${minMuestras} turnos): se guarda pero siguen las reglas.`;
  else if (!gana) motivo = "El modelo no superó a las reglas en las fechas de prueba: siguen las reglas.";
  else motivo = `El modelo se equivoca ${Math.round(mejora * 100)}% menos que las reglas: queda activo.`;

  return {
    ...resumen,
    entrenamiento: train.length,
    prueba: prueba.length,
    desde: ordenadas[0].fecha,
    hasta: ordenadas[ordenadas.length - 1].fecha,
    maeModelo: Number(maeModelo.toFixed(3)),
    maeReglas: Number(maeReglas.toFixed(3)),
    mejora: Number(mejora.toFixed(3)),
    activo: suficientes && gana,
    motivo,
    modelo,
  };
}
