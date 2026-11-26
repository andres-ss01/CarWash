// =============================================================================
// src/controllers/CronogramaController.js - Cronograma semanal de trabajadores
// =============================================================================

import asyncHandler from "../utils/asyncHandler.js";

export default class CronogramaController {
  constructor(service) {
    this.service = service;
  }

  // GET /api/cronograma?semana=YYYY-MM-DD
  getSemana = asyncHandler(async (req, res) => {
    res.status(200).json(await this.service.getSemana(req.user, req.query));
  });

  // PUT /api/cronograma/:idTrabajador/:dia   { trabaja }
  setPlantilla = asyncHandler(async (req, res) => {
    res.status(200).json(await this.service.setPlantilla(req.params.idTrabajador, req.params.dia, req.body));
  });

  // PUT /api/cronograma/:idTrabajador/excepciones/:fecha   { estado, nota? }
  setExcepcion = asyncHandler(async (req, res) => {
    res.status(200).json(
      await this.service.setExcepcion(req.user, req.params.idTrabajador, req.params.fecha, req.body));
  });

  // DELETE /api/cronograma/:idTrabajador/excepciones/:fecha
  quitarExcepcion = asyncHandler(async (req, res) => {
    res.status(200).json(await this.service.quitarExcepcion(req.params.idTrabajador, req.params.fecha));
  });

  // POST /api/cronograma/ausencia   { fecha?, nota? }
  registrarAusencia = asyncHandler(async (req, res) => {
    res.status(201).json(await this.service.registrarAusencia(req.user, req.body));
  });

  // DELETE /api/cronograma/ausencia/:fecha
  quitarAusencia = asyncHandler(async (req, res) => {
    res.status(200).json(await this.service.quitarAusencia(req.user, req.params.fecha, req.query));
  });
}
