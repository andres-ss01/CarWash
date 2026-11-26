// =============================================================================
// src/controllers/PanelController.js - Portada del administrador y clima
// =============================================================================

import asyncHandler from "../utils/asyncHandler.js";

export default class PanelController {
  constructor(service) {
    this.service = service;
  }

  // GET /api/panel/hoy
  hoy = asyncHandler(async (req, res) => {
    res.status(200).json(await this.service.hoy());
  });

  // GET /api/panel/clima?fecha=YYYY-MM-DD
  clima = asyncHandler(async (req, res) => {
    res.status(200).json(await this.service.clima(req.query));
  });
}
