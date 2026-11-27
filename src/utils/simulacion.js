// =============================================================================
// src/utils/simulacion.js - Historial SIMULADO de lavados y clima (solo para pruebas)
// -----------------------------------------------------------------------------
// Genera semanas de citas con efectos CONOCIDOS para poder demostrar el modelo de demanda
// sin esperar meses de datos reales:
//   - temporada de lluvias (jun-sep) y probabilidad de lluvia por turno
//   - la lluvia baja la demanda, la quincena la sube, los festivos la bajan
//   - parte de las citas se agenda con días de anticipación (variable "agendadas")
// Es puro (sin base de datos): lo usa scripts/simular_historial.js y se prueba con npm test.
// =============================================================================

import { esFestivo, esQuincena } from "./modeloDemanda.js";

// Efectos "verdaderos" de la simulación (el modelo debería encontrarlos aproximadamente)
export const EFECTOS_SIMULADOS = Object.freeze({
  lluvia: -1.4,        // demanda x e^(-1.4 * prob)  -> con 100 % de lluvia, ~25 % de la demanda
  quincena: 1.35,      // +35 %
  festivo: 0.7,        // -30 %
  vespertino: 1.2,     // la tarde tiene 20 % más
  anticipadas: 0.45,   // 45 % de las citas se agenda antes de la víspera a las 18:00
});

// Lavados base por turno según el día (1 = lunes ... 7 = domingo)
const BASE_DIA = { 1: 4, 2: 4, 3: 5, 4: 5, 5: 7, 6: 11, 7: 9 };

export function generadorAleatorio(semilla = 42) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function poisson(lambda, r) {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do { k++; p *= r(); } while (p > L);
  return k - 1;
}

const pad = (n) => String(n).padStart(2, "0");
const partes = (f) => f.split("-").map(Number);
export const sumarDias = (fecha, n) => {
  const [y, m, d] = partes(fecha);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
export const diaSemana = (fecha) => {
  const [y, m, d] = partes(fecha);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return w === 0 ? 7 : w;
};
const horaTexto = (fecha, minutos) => `${fecha} ${pad(Math.floor(minutos / 60))}:${pad(minutos % 60)}:00`;

// Clima de un día con temporada de lluvias (como en el centro de México)
export function climaSimulado(fecha, r) {
  const mes = partes(fecha)[1];
  const pLluvioso = mes >= 6 && mes <= 9 ? 0.55 : mes === 5 || mes === 10 ? 0.25 : 0.1;
  const lluvioso = r() < pLluvioso;
  // En temporada llueve más por la tarde
  const probMatutino = Math.round(lluvioso ? 20 + r() * 50 : r() * 25);
  const probVespertino = Math.round(lluvioso ? 60 + r() * 40 : r() * 30);
  return {
    fecha,
    probLluvia: Math.max(probMatutino, probVespertino),
    probMatutino,
    probVespertino,
    precipitacionMm: lluvioso ? Math.round((2 + r() * 18) * 10) / 10 : 0,
    tempMax: Math.round((18 + r() * 10) * 10) / 10,
    vientoMax: Math.round((5 + r() * 15) * 10) / 10,
  };
}

/**
 * Genera citas y clima entre `desde` y `hasta` (incluidas).
 *   horarios: Map dia (1..7) -> { apertura: minutos, cierre: minutos }   (días sin fila = cerrado)
 *   ventanas: { matutino: [8, 14], vespertino: [14, 20] }   (horas)
 * Devuelve { citas: [{ inicio, fin, creacion, estado }], clima: [...] }
 */
export function simularHistorial({ desde, hasta, horarios, ventanas, semilla = 42, duracionMin = 45 }) {
  const r = generadorAleatorio(semilla);
  const citas = [];
  const clima = [];

  for (let fecha = desde; fecha <= hasta; fecha = sumarDias(fecha, 1)) {
    const c = climaSimulado(fecha, r);
    clima.push(c);
    const dia = diaSemana(fecha);
    const horario = horarios.get(dia);
    if (!horario) continue; // cerrado

    for (const [turno, [ini, fin]] of Object.entries(ventanas)) {
      const desdeMin = Math.max(ini * 60, horario.apertura);
      const hastaMin = Math.min(fin * 60, horario.cierre) - duracionMin;
      if (hastaMin <= desdeMin) continue; // el turno no cabe en el horario de ese día

      const prob = (turno === "matutino" ? c.probMatutino : c.probVespertino) / 100;
      const lambda = (BASE_DIA[dia] ?? 5)
        * (turno === "vespertino" ? EFECTOS_SIMULADOS.vespertino : 1)
        * Math.exp(EFECTOS_SIMULADOS.lluvia * prob)
        * (esQuincena(fecha) ? EFECTOS_SIMULADOS.quincena : 1)
        * (esFestivo(fecha) ? EFECTOS_SIMULADOS.festivo : 1);
      const n = poisson(lambda, r);

      for (let k = 0; k < n; k++) {
        const slots = Math.floor((hastaMin - desdeMin) / 15) + 1;
        const inicioMin = desdeMin + Math.floor(r() * slots) * 15;
        // Agendada con anticipación (1 a 5 días antes, en horario de día) o el mismo día
        let creacion;
        if (r() < EFECTOS_SIMULADOS.anticipadas) {
          const diasAntes = 2 + Math.floor(r() * 4);
          creacion = horaTexto(sumarDias(fecha, -diasAntes), 9 * 60 + Math.floor(r() * 9 * 60));
        } else {
          creacion = horaTexto(fecha, Math.max(0, inicioMin - 30 - Math.floor(r() * 90)));
        }
        const x = r();
        citas.push({
          inicio: horaTexto(fecha, inicioMin),
          fin: horaTexto(fecha, inicioMin + duracionMin),
          creacion,
          estado: x < 0.92 ? "completada" : x < 0.97 ? "cancelada" : "no_asistio",
        });
      }
    }
  }
  return { citas, clima };
}
