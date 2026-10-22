// =============================================================================
// src/controllers/CitaController.js - Controlador de Citas
// =============================================================================

import asyncHandler from "../utils/asyncHandler.js";

export default class CitaController {
  constructor(citaService) {
    this.citaService = citaService;
  }

  // GET /api/citas/disponibilidad?fecha=2026-10-22&servicios=1,2   (público)
  disponibilidad = asyncHandler(async (req, res) => {
    res.status(200).json(await this.citaService.disponibilidad(req.query));
  });

  // GET /api/citas?estado=programada&fecha=2026-10-22&idCliente=3
  getAll = asyncHandler(async (req, res) => {
    res.status(200).json(await this.citaService.getAll(req.user, req.query));
  });

  getById = asyncHandler(async (req, res) => {
    res.status(200).json(await this.citaService.getById(req.user, req.params.id));
  });

  // POST /api/citas
  create = asyncHandler(async (req, res) => {
    res.status(201).json(await this.citaService.crear(req.user, req.body));
  });

  // PATCH /api/citas/:id/cancelar
  cancelar = asyncHandler(async (req, res) => {
    res.status(200).json(await this.citaService.cancelar(req.user, req.params.id));
  });

  // PATCH /api/citas/:id/estado   (staff)
  cambiarEstado = asyncHandler(async (req, res) => {
    res.status(200).json(await this.citaService.cambiarEstado(req.params.id, req.body));
  });
}
