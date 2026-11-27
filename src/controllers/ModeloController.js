// =============================================================================
// src/controllers/ModeloController.js - Modelo de machine learning de la demanda (Fase 13)
// =============================================================================

import asyncHandler from "../utils/asyncHandler.js";

export default class ModeloController {
  constructor(service) {
    this.service = service;
  }

  // GET /api/modelo
  estado = asyncHandler(async (req, res) => {
    res.status(200).json(await this.service.estado());
  });

  // POST /api/modelo/entrenar
  entrenar = asyncHandler(async (req, res) => {
    res.status(200).json(await this.service.entrenar());
  });

  // POST /api/modelo/desactivar
  desactivar = asyncHandler(async (req, res) => {
    res.status(200).json(await this.service.desactivar());
  });

  // POST /api/modelo/clima-historico   { desde?, hasta? }
  climaHistorico = asyncHandler(async (req, res) => {
    res.status(200).json(await this.service.rellenarClima(req.body));
  });

  // GET /api/modelo/datos?formato=csv
  datos = asyncHandler(async (req, res) => {
    const r = await this.service.exportar(req.query);
    if (r.tipo === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="datos_demanda.csv"');
      return res.status(200).send(r.texto);
    }
    res.status(200).json(r.filas);
  });
}
