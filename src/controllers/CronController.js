// =============================================================================
// src/controllers/CronController.js - Tarea diaria (Vercel Cron)
// =============================================================================

import crypto from "node:crypto";
import asyncHandler from "../utils/asyncHandler.js";
import AppError from "../utils/AppError.js";
import { config } from "../config/config.js";

export default class CronController {
  constructor(sugerenciaService, climaService) {
    this.sugerenciaService = sugerenciaService;
    this.climaService = climaService;
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
  sugerencias = asyncHandler(async (req, res) => {
    await this.climaService.sincronizar();
    const expiradas = await this.sugerenciaService.expirarPasadas();
    const resultado = await this.sugerenciaService.generar(this.sugerenciaService.manana());
    res.status(200).json({
      fecha: resultado.fecha, modo: resultado.modo, creadas: resultado.creadas, expiradas, turnos: resultado.turnos,
    });
  });
}
