// =============================================================================
// src/routes/nominaRoutes.js - /api/nomina (pago por día y nómina semanal)
// =============================================================================

import { Router } from "express";
import NominaService from "../services/NominaService.js";
import AuthMiddleware from "../middlewares/AuthMiddleware.js";
import asyncHandler from "../utils/asyncHandler.js";

const { authenticate, authorize } = AuthMiddleware;
const router = Router();
const service = new NominaService();
const staff = authorize("administrador", "trabajador");
const admin = authorize("administrador");

router.use(authenticate);

// Semana actual (o la indicada): admin ve a todos, el trabajador solo lo suyo
router.get("/", staff, asyncHandler(async (req, res) => {
  res.status(200).json(await service.semana(req.user, req.query));
}));

// Semanas anteriores ya cerradas
router.get("/historial", staff, asyncHandler(async (req, res) => {
  res.status(200).json(await service.historial(req.user, req.query));
}));

// Pago por día de cada trabajador
router.get("/pagos", admin, asyncHandler(async (req, res) => {
  res.status(200).json(await service.pagos());
}));

router.put("/:idTrabajador/pago", admin, asyncHandler(async (req, res) => {
  res.status(200).json(await service.setPago(req.params.idTrabajador, req.body));
}));

export default router;
