// =============================================================================
// src/routes/ordenRoutes.js - Endpoints de /api/ordenes
// =============================================================================

import { Router } from "express";
import OrdenService from "../services/OrdenService.js";
import OrdenController from "../controllers/OrdenController.js";
import AuthMiddleware from "../middlewares/AuthMiddleware.js";

const { authenticate, authorize } = AuthMiddleware;
const router = Router();
const controller = new OrdenController(new OrdenService());
const staff = authorize("administrador", "trabajador");

router.use(authenticate);

router.get("/estados", controller.getEstados); // antes de /:id
router.get("/", controller.getAll);
router.get("/:id", controller.getById);
router.get("/:id/seguimiento", controller.getSeguimiento);
router.post("/", staff, controller.create);
router.post("/:id/avanzar", staff, controller.avanzar);
router.post("/:id/trabajadores", authorize("administrador"), controller.asignarTrabajador);
router.delete("/:id/trabajadores/:idTrabajador", authorize("administrador"), controller.quitarTrabajador);

export default router;
