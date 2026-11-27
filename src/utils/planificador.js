// =============================================================================
// src/utils/planificador.js - Reglas puras para estimar demanda y sugerir descansos
// -----------------------------------------------------------------------------
// SIN base de datos ni red: solo funciones que reciben datos y devuelven decisiones.
// Así se pueden probar con `npm test` y, más adelante, reemplazar `estimarLavados`
// por un modelo de machine learning sin tocar el resto.
// =============================================================================

// Fase 13: el modelo de ML (import circular seguro: solo se usan funciones declaradas)
import { featuresCrudas, predecirModelo } from "./modeloDemanda.js";

export const TURNOS = ["matutino", "vespertino"];

// Un trabajador "mixto" cubre los dos turnos
export const turnosQueCubre = (turno) => (turno === "mixto" ? [...TURNOS] : [turno]);

// Cuánto baja la demanda según la probabilidad de lluvia (%)
export function factorLluvia(prob) {
  if (prob === null || prob === undefined) return 1;
  if (prob >= 80) return 0.5;
  if (prob >= 60) return 0.65;
  if (prob >= 40) return 0.85;
  return 1;
}

const redondear1 = (n) => Math.round(n * 10) / 10;

// Lavados esperados en un turno.
//   historico: lavados observados en ese día de la semana y turno durante `semanas` semanas
//   Con menos de 3 semanas de historial se usa `demandaBase` (arranque en frío).
//   Fase 13: si llega un `modelo` activo (y hay historial), predice el modelo de machine learning;
//   `contexto` trae lo demás que necesita: { fecha, turno, precipitacionMm, tempMax, agendadas }.
export function estimarLavados({ historico, semanas, demandaBase, probLluvia, modelo = null, contexto = null }) {
  const hayHistorial = semanas >= 3;
  const base = hayHistorial ? historico / semanas : demandaBase;

  if (modelo && hayHistorial && contexto) {
    const estimado = predecirModelo(modelo, featuresCrudas({ ...contexto, base, probLluvia }));
    return {
      estimado: redondear1(estimado),
      base: redondear1(base),
      factor: base > 0 ? Math.round((estimado / base) * 100) / 100 : null,
      metodo: modelo.metodo || "modelo-v1",
      conHistorial: true,
    };
  }

  const factor = factorLluvia(probLluvia);
  return {
    estimado: redondear1(base * factor),
    base: redondear1(base),
    factor,
    metodo: "reglas-v1",
    conHistorial: hayHistorial,
  };
}

export const lavadoresNecesarios = (estimado, capacidad, minimo) =>
  Math.max(minimo, Math.ceil(estimado / capacidad - 1e-9));

// Cuántos lavadores cubre cada turno, dados los trabajadores [{ id, turno }]
export function contarPorTurno(trabajadores) {
  const cuenta = { matutino: 0, vespertino: 0 };
  for (const t of trabajadores) for (const s of turnosQueCubre(t.turno)) cuenta[s]++;
  return cuenta;
}

// ¿A quién sugerir descansar? Solo si TODOS los turnos que cubre tienen lluvia >= umbral y,
// al quitarlo, cada uno de esos turnos sigue teniendo al menos los lavadores necesarios.
//   programados: [{ id, turno }] que trabajan ese día
//   necesarios:  { matutino, vespertino }
//   prob:        { matutino, vespertino } en % (null = sin dato)
//   descansosRecientes: Map(id -> cuántos descansos por clima lleva); quien menos lleva, primero
//   elegibles: Set de ids a los que se les puede sugerir (por omisión, todos los programados)
export function elegirDescansos({ programados, necesarios, prob, umbral, descansosRecientes = new Map(), elegibles = null }) {
  const cuenta = contarPorTurno(programados);
  const orden = [...programados].sort(
    (a, b) => (descansosRecientes.get(a.id) || 0) - (descansosRecientes.get(b.id) || 0) || a.id - b.id
  );
  const elegidos = [];
  for (const t of orden) {
    if (elegibles && !elegibles.has(t.id)) continue;
    const turnos = turnosQueCubre(t.turno);
    const puede = turnos.every(
      (s) => (prob[s] ?? -1) >= umbral && cuenta[s] - 1 >= necesarios[s]
    );
    if (!puede) continue;
    for (const s of turnos) cuenta[s]--;
    elegidos.push(t.id);
  }
  return elegidos;
}

// ¿A quién pedirle que trabaje (voluntario) cuando faltan lavadores?
//   libres: [{ id, turno }] que hoy no trabajan por su plantilla y no tienen excepción
//   extrasRecientes: Map(id -> cuántos días extra lleva); quien menos lleva, primero
export function elegirRefuerzos({ programados, libres, necesarios, extrasRecientes = new Map() }) {
  const cuenta = contarPorTurno(programados);
  const orden = [...libres].sort(
    (a, b) => (extrasRecientes.get(a.id) || 0) - (extrasRecientes.get(b.id) || 0) || a.id - b.id
  );
  const elegidos = [];
  for (const s of TURNOS) {
    for (const t of orden) {
      if (cuenta[s] >= necesarios[s]) break;
      if (elegidos.includes(t.id) || !turnosQueCubre(t.turno).includes(s)) continue;
      for (const c of turnosQueCubre(t.turno)) cuenta[c]++;
      elegidos.push(t.id);
    }
  }
  return elegidos;
}
