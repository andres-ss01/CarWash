// =============================================================================
// src/controllers/ServicioController.js - Controlador del catálogo de servicios
// =============================================================================

import asyncHandler from "../utils/asyncHandler.js";

export default class ServicioController {
  constructor(servicioService) {
    this.servicioService = servicioService;
  }

  // GET /api/servicios   (público: solo activos)
  getAll = asyncHandler(async (req, res) => {
    res.status(200).json(await this.servicioService.getAll(req.query));
  });

  // GET /api/servicios/admin/todos   (admin: incluye inactivos)
  getAllAdmin = asyncHandler(async (req, res) => {
    res.status(200).json(await this.servicioService.getAll(req.query, { soloActivos: false }));
  });

  getById = asyncHandler(async (req, res) => {
    res.status(200).json(await this.servicioService.getById(req.params.id));
  });

  create = asyncHandler(async (req, res) => {
    res.status(201).json(await this.servicioService.create(req.body));
  });

  update = asyncHandler(async (req, res) => {
    res.status(200).json(await this.servicioService.update(req.params.id, req.body));
  });

  // DELETE -> baja lógica
  delete = asyncHandler(async (req, res) => {
    const servicio = await this.servicioService.desactivar(req.params.id);
    res.status(200).json({ message: "Servicio desactivado correctamente", servicio });
  });
}
