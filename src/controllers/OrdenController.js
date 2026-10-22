// =============================================================================
// src/controllers/OrdenController.js - Controlador de Órdenes y seguimiento
// =============================================================================

import asyncHandler from "../utils/asyncHandler.js";

export default class OrdenController {
  constructor(ordenService) {
    this.ordenService = ordenService;
  }

  // GET /api/ordenes?abiertas=true&idEstadoOrden=2
  getAll = asyncHandler(async (req, res) => {
    res.status(200).json(await this.ordenService.getAll(req.user, req.query));
  });

  // GET /api/ordenes/estados
  getEstados = asyncHandler(async (req, res) => {
    res.status(200).json(await this.ordenService.getEstados());
  });

  getById = asyncHandler(async (req, res) => {
    res.status(200).json(await this.ordenService.getById(req.user, req.params.id));
  });

  // GET /api/ordenes/:id/seguimiento  (barra de progreso + historial)
  getSeguimiento = asyncHandler(async (req, res) => {
    res.status(200).json(await this.ordenService.getSeguimiento(req.user, req.params.id));
  });

  // POST /api/ordenes   { idCita }
  create = asyncHandler(async (req, res) => {
    res.status(201).json(await this.ordenService.crear(req.user, req.body));
  });

  // POST /api/ordenes/:id/avanzar
  avanzar = asyncHandler(async (req, res) => {
    res.status(200).json(await this.ordenService.avanzar(req.user, req.params.id));
  });

  // POST /api/ordenes/:id/trabajadores   { idTrabajador }
  asignarTrabajador = asyncHandler(async (req, res) => {
    res.status(201).json(await this.ordenService.asignarTrabajador(req.params.id, req.body));
  });

  // DELETE /api/ordenes/:id/trabajadores/:idTrabajador
  quitarTrabajador = asyncHandler(async (req, res) => {
    res.status(200).json(await this.ordenService.quitarTrabajador(req.params.id, req.params.idTrabajador));
  });
}
