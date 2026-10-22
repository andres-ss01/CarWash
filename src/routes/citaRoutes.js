// =============================================================================
// src/routes/citaRoutes.js - Endpoints de /api/citas
// =============================================================================

import { Router } from "express";
import CitaService from "../services/CitaService.js";
import CitaController from "../controllers/CitaController.js";
import AuthMiddleware from "../middlewares/AuthMiddleware.js";

const { authenticate, authorize } = AuthMiddleware;
const router = Router();
const controller = new CitaController(new CitaService());

router.get("/disponibilidad", controller.disponibilidad); // público, antes de /:id

router.use(authenticate);
router.get("/", controller.getAll);
router.get("/:id", controller.getById);
router.post("/", controller.create);
router.patch("/:id/cancelar", controller.cancelar);
router.patch("/:id/estado", authorize("administrador", "trabajador"), controller.cambiarEstado);

export default router;
