// =============================================================================
// src/routes/pagoRoutes.js - Endpoints de /api/pagos
// =============================================================================

import { Router } from "express";
import PagoService from "../services/PagoService.js";
import PagoController from "../controllers/PagoController.js";
import AuthMiddleware from "../middlewares/AuthMiddleware.js";

const { authenticate, authorize } = AuthMiddleware;
const router = Router();
const controller = new PagoController(new PagoService());

router.use(authenticate);

router.get("/", controller.getAll);
router.get("/:id", controller.getById);
router.post("/", authorize("administrador", "trabajador"), controller.create);
router.patch("/:id/estado", authorize("administrador"), controller.cambiarEstado);

export default router;
