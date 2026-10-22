// =============================================================================
// src/controllers/HorarioController.js - Controlador de horarios de atención
// =============================================================================

import asyncHandler from "../utils/asyncHandler.js";

export default class HorarioController {
  constructor(horarioService) {
    this.horarioService = horarioService;
  }

  // GET /api/horarios
  getAll = asyncHandler(async (req, res) => {
    res.status(200).json(await this.horarioService.getAll());
  });

  // PUT /api/horarios/:dia   { horaApertura: "08:00", horaCierre: "18:00" }
  upsert = asyncHandler(async (req, res) => {
    res.status(200).json(await this.horarioService.upsert(req.params.dia, req.body));
  });

  // DELETE /api/horarios/:dia  (cerrado ese día)
  delete = asyncHandler(async (req, res) => {
    const horario = await this.horarioService.delete(req.params.dia);
    res.status(200).json({ message: "Horario eliminado: el establecimiento no abrirá ese día", horario });
  });
}
