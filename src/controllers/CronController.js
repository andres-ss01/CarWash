// =============================================================================
// src/controllers/CronController.js - Tarea diaria (Vercel Cron)
// =============================================================================

import crypto from "node:crypto";
import asyncHandler from "../utils/asyncHandler.js";
import AppError from "../utils/AppError.js";
import { config } from "../config/config.js";

export default class CronController {
  constructor(sugerenciaService, climaService, modeloService, nominaService) {
    this.sugerenciaService = sugerenciaService;
    this.climaService = climaService;
    this.modeloService = modeloService;
    this.nominaService = nominaService;
  }

  // Vercel Cron envía "Authorization: Bearer <CRON_SECRET>" si la variable está definida
  autenticar = (req, res, next) => {
    const secreto = config.cronSecret;
    if (!secreto) return next(new AppError("CRON_SECRET no está configurado", 503));
    const recibido = Buffer.from(req.headers.authorization || "");
    const esperado = Buffer.from(`Bearer ${secreto}`);
    if (recibido.length !== esperado.length || !crypto.timingSafeEqual(recibido, esperado)) {
      return next(new AppError("No autorizado", 401));
    }
    next();
  };

  // GET /api/cron/sugerencias: actualiza el clima, expira lo viejo y genera las sugerencias de mañana
  // Fase 13: antes de predecir, reentrena el modelo si toca (cada MODELO_DIAS_REENTRENAR días).
  // Si el entrenamiento falla, el cron sigue con el modelo anterior o con las reglas.
  sugerencias = asyncHandler(async (req, res) => {
    await this.climaService.sincronizar();
    let modelo = null;
    try {
      if (await this.modeloService.necesitaReentrenar()) {
        const r = await this.modeloService.entrenar();
        modelo = { reentrenado: r.guardado, activo: r.activo, motivo: r.motivo, maeModelo: r.maeModelo, maeReglas: r.maeReglas };
      }
    } catch (err) {
      console.error("Cron: no se pudo reentrenar el modelo:", err.message);
      modelo = { error: err.message };
    }
    // Cierra la nómina de la semana pasada (si ya está cerrada no hace nada)
    let nomina = null;
    try {
      nomina = { semanaCerrada: await this.nominaService.cerrarSemanaPasada() };
    } catch (err) {
      console.error("Cron: no se pudo cerrar la nómina (¿falta la migración 005?):", err.message);
      nomina = { error: err.message };
    }
    const expiradas = await this.sugerenciaService.expirarPasadas();
    const resultado = await this.sugerenciaService.generar(this.sugerenciaService.manana());
    res.status(200).json({
      fecha: resultado.fecha, modo: resultado.modo, creadas: resultado.creadas, expiradas, turnos: resultado.turnos, modelo, nomina,
    });
  });
}
