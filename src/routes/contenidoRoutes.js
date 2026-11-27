// =============================================================================
// src/routes/contenidoRoutes.js - /api/contenido (textos editables de la app)
// =============================================================================

import { Router } from "express";
import ContenidoService from "../services/ContenidoService.js";
import AuthMiddleware from "../middlewares/AuthMiddleware.js";
import asyncHandler from "../utils/asyncHandler.js";

const { authenticate, authorize } = AuthMiddleware;
const router = Router();
const service = new ContenidoService();

router.get("/sobre-nosotros", asyncHandler(async (req, res) => {
  res.status(200).json(await service.getSobreNosotros());
}));

router.put("/sobre-nosotros", authenticate, authorize("administrador"), asyncHandler(async (req, res) => {
  res.status(200).json(await service.setSobreNosotros(req.body));
}));

export default router;
