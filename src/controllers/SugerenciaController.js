// =============================================================================
// src/controllers/SugerenciaController.js - Sugerencias de descansar / trabajar
// =============================================================================

import asyncHandler from "../utils/asyncHandler.js";

export default class SugerenciaController {
  constructor(service) {
    this.service = service;
  }

  // GET /api/sugerencias/mias?estado=pendiente
  getMias = asyncHandler(async (req, res) => {
    res.status(200).json(await this.service.getMias(req.user, req.query));
  });

  // GET /api/sugerencias?fecha=&estado=
  getAll = asyncHandler(async (req, res) => {
    res.status(200).json(await this.service.getAll(req.query));
  });

  // POST /api/sugerencias/generar   { fecha? }   (por omisión, mañana)
  generar = asyncHandler(async (req, res) => {
    const fecha = req.body?.fecha ?? this.service.manana();
    res.status(200).json(await this.service.generar(fecha));
  });

  // PATCH /api/sugerencias/:id   { estado: "aceptada" | "rechazada" }
  responder = asyncHandler(async (req, res) => {
    res.status(200).json(await this.service.responder(req.user, req.params.id, req.body));
  });
}
