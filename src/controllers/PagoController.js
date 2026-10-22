// =============================================================================
// src/controllers/PagoController.js - Controlador de Pagos
// =============================================================================

import asyncHandler from "../utils/asyncHandler.js";

export default class PagoController {
  constructor(pagoService) {
    this.pagoService = pagoService;
  }

  // GET /api/pagos?idOrden=1&estado=pagado
  getAll = asyncHandler(async (req, res) => {
    res.status(200).json(await this.pagoService.getAll(req.user, req.query));
  });

  getById = asyncHandler(async (req, res) => {
    res.status(200).json(await this.pagoService.getById(req.user, req.params.id));
  });

  // POST /api/pagos   (staff)
  create = asyncHandler(async (req, res) => {
    res.status(201).json(await this.pagoService.crear(req.user, req.body));
  });

  // PATCH /api/pagos/:id/estado   (admin)
  cambiarEstado = asyncHandler(async (req, res) => {
    res.status(200).json(await this.pagoService.cambiarEstado(req.params.id, req.body));
  });
}
