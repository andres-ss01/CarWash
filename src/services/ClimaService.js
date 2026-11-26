// =============================================================================
// src/services/ClimaService.js - Pronóstico del clima (Open-Meteo, gratis y sin clave)
// -----------------------------------------------------------------------------
// Cada sincronización trae 2 días atrás (queda como "observado", útil para entrenar el
// modelo) y 4 hacia adelante. Si el servicio falla pero ya hay datos guardados, se usan.
// =============================================================================

import Clima from "../models/Clima.js";
import AppError from "../utils/AppError.js";
import { config } from "../config/config.js";
import { parsearOpenMeteo } from "../utils/clima.js";
import { ahoraLocal, hoyLocal, parseFechaHora } from "../utils/fechas.js";

const HORAS_FRESCO = 6;

export default class ClimaService {
  constructor() {
    this.model = new Clima();
  }

  async sincronizar() {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.search = new URLSearchParams({
      latitude: String(config.latitud),
      longitude: String(config.longitud),
      daily: "precipitation_probability_max,precipitation_sum,temperature_2m_max,wind_speed_10m_max",
      hourly: "precipitation_probability",
      timezone: process.env.APP_TZ || "America/Mexico_City",
      past_days: "2",
      forecast_days: "4",
    }).toString();

    let json;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      json = await res.json();
    } catch (err) {
      throw new AppError(`No se pudo consultar el pronóstico del clima (${err.message})`, 502);
    }

    const filas = parsearOpenMeteo(json, config.ventanasTurno, hoyLocal());
    if (!filas.length) throw new AppError("El servicio de clima respondió sin datos", 502);
    for (const fila of filas) await this.model.upsert(fila);
    return filas.length;
  }

  // Clima de una fecha "YYYY-MM-DD": usa lo guardado si es reciente; si no, sincroniza.
  async obtenerDia(fecha) {
    let fila = await this.model.find(fecha);
    const minutos = fila ? (ahoraLocal() - parseFechaHora(fila.actualizado)) / 60000 : Infinity;
    const fresco = fila && (fila.observado || minutos < HORAS_FRESCO * 60);

    if (!fresco) {
      try {
        await this.sincronizar();
        fila = await this.model.find(fecha);
      } catch (err) {
        if (!fila) throw err; // sin datos viejos que usar
      }
    }
    if (!fila) throw new AppError("No hay pronóstico para esa fecha (cubre unos 3 días hacia adelante)", 404);
    return fila;
  }
}
