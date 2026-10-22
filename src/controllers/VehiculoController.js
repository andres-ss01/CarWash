// =============================================================================
// src/controllers/VehiculoController.js - Controlador de Vehículos
// =============================================================================

import asyncHandler from "../utils/asyncHandler.js";

export default class VehiculoController {
  constructor(vehiculoService) {
    this.vehiculoService = vehiculoService;
  }

  // GET /api/vehiculos?idCliente=3&limit=5&sort=desc  (el cliente solo ve los suyos)
  getAll = asyncHandler(async (req, res) => {
    res.status(200).json(await this.vehiculoService.getAll(req.user, req.query));
  });

  getById = asyncHandler(async (req, res) => {
    res.status(200).json(await this.vehiculoService.getById(req.user, req.params.id));
  });

  create = asyncHandler(async (req, res) => {
    res.status(201).json(await this.vehiculoService.create(req.user, req.body));
  });

  update = asyncHandler(async (req, res) => {
    res.status(200).json(await this.vehiculoService.update(req.user, req.params.id, req.body));
  });

  delete = asyncHandler(async (req, res) => {
    const vehiculo = await this.vehiculoService.delete(req.user, req.params.id);
    res.status(200).json({ message: "Vehículo eliminado correctamente", vehiculo });
  });
}
