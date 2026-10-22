// =============================================================================
// src/controllers/NotificacionController.js - Controlador de Notificaciones
// =============================================================================

import asyncHandler from "../utils/asyncHandler.js";

export default class NotificacionController {
  constructor(notificacionService) {
    this.notificacionService = notificacionService;
  }

  // GET /api/notificaciones?leida=false&limit=20
  getMias = asyncHandler(async (req, res) => {
    res.status(200).json(await this.notificacionService.getMias(req.user, req.query));
  });

  // PATCH /api/notificaciones/leer-todas
  marcarTodasLeidas = asyncHandler(async (req, res) => {
    res.status(200).json(await this.notificacionService.marcarTodasLeidas(req.user));
  });

  // PATCH /api/notificaciones/:id/leida
  marcarLeida = asyncHandler(async (req, res) => {
    res.status(200).json(await this.notificacionService.marcarLeida(req.user, req.params.id));
  });
}
