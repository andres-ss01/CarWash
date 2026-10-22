// =============================================================================
// src/controllers/TipoVehiculoController.js - Controlador de tipos de vehículo
// =============================================================================

import asyncHandler from "../utils/asyncHandler.js";

export default class TipoVehiculoController {
  constructor(tipoVehiculoService) {
    this.tipoVehiculoService = tipoVehiculoService;
  }

  getAll = asyncHandler(async (req, res) => {
    res.status(200).json(await this.tipoVehiculoService.getAll());
  });

  getById = asyncHandler(async (req, res) => {
    res.status(200).json(await this.tipoVehiculoService.getById(req.params.id));
  });

  create = asyncHandler(async (req, res) => {
    res.status(201).json(await this.tipoVehiculoService.create(req.body));
  });

  update = asyncHandler(async (req, res) => {
    res.status(200).json(await this.tipoVehiculoService.update(req.params.id, req.body));
  });

  delete = asyncHandler(async (req, res) => {
    const tipo = await this.tipoVehiculoService.delete(req.params.id);
    res.status(200).json({ message: "Tipo de vehículo eliminado correctamente", tipoVehiculo: tipo });
  });
}
