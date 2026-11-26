// =============================================================================
// src/utils/fechas.js - Manejo de fechas "de pared" (hora local del negocio)
// -----------------------------------------------------------------------------
// MySQL DATETIME no tiene zona horaria. Para evitar desfases, aquí toda fecha se
// trata como hora local y se guarda en un Date usando sus campos UTC (solo como
// contenedor). Por eso se usan siempre los getters getUTC*.
// =============================================================================

import AppError from "./AppError.js";

const RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/;
const pad = (n) => String(n).padStart(2, "0");

// "2026-10-22 09:30" | "2026-10-22T09:30" | "2026-10-22" -> Date (contenedor UTC)
export function parseFechaHora(value, name = "fecha") {
  const m = RE.exec(String(value ?? "").trim());
  const error = new AppError(`${name} inválida. Usa el formato YYYY-MM-DD HH:mm`, 400);
  if (!m) throw error;
  const [y, mo, d, h = "00", mi = "00", s = "00"] = m.slice(1);
  const date = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  // Rechaza fechas imposibles (2026-02-31, 25:00...) que JS "corrige" en silencio
  const ok =
    date.getUTCFullYear() === +y && date.getUTCMonth() === +mo - 1 && date.getUTCDate() === +d &&
    date.getUTCHours() === +h && date.getUTCMinutes() === +mi;
  if (!ok) throw error;
  return date;
}

export const addMinutes = (date, min) => new Date(date.getTime() + min * 60000);

export const formatFecha = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
export const formatHora = (d) => `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
export const formatFechaHora = (d) => `${formatFecha(d)} ${formatHora(d)}:${pad(d.getUTCSeconds())}`;

// 1 = lunes ... 7 = domingo (igual que HorarioAtencion.dia_semana)
export const diaSemana = (d) => (d.getUTCDay() === 0 ? 7 : d.getUTCDay());

export const minutosDelDia = (d) => d.getUTCHours() * 60 + d.getUTCMinutes();

// "08:30" o "08:30:00" -> 510
export function horaAMinutos(texto) {
  const [h, m] = String(texto).split(":");
  return Number(h) * 60 + Number(m);
}

export const minutosAHora = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

// Hora actual del negocio expresada como "hora de pared".
// Usa APP_TZ (por defecto America/Mexico_City) y no la zona del servidor: Vercel corre en UTC
// y no permite definir la variable TZ.
export function ahoraLocal() {
  const tz = process.env.APP_TZ || "America/Mexico_City";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date());
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return new Date(Date.UTC(+v.year, +v.month - 1, +v.day, +v.hour, +v.minute, +v.second));
}

// "2026-11-27" -> "viernes 27 de noviembre" (para mensajes al personal)
export function fechaLegible(fecha) {
  const d = typeof fecha === "string" ? parseFechaHora(fecha) : fecha;
  return new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(d);
}

// Suma `n` días a una fecha "YYYY-MM-DD" y devuelve "YYYY-MM-DD"
export const sumarDias = (fecha, n) => formatFecha(addMinutes(parseFechaHora(fecha), n * 1440));

// Fecha de hoy en la hora del negocio, "YYYY-MM-DD"
export const hoyLocal = () => formatFecha(ahoraLocal());
