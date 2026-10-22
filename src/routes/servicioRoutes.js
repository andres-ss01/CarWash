// =============================================================================
// src/routes/servicioRoutes.js - Endpoints de /api/servicios
// =============================================================================

import { Router } from "express";
import ServicioService from "../services/ServicioService.js";
import ServicioController from "../controllers/ServicioController.js";
import AuthMiddleware from "../middlewares/AuthMiddleware.js";

const { authenticate, authorize } = AuthMiddleware;
const router = Router();
const controller = new ServicioController(new ServicioService());
const admin = [authenticate, authorize("administrador")];

router.get("/admin/todos", ...admin, controller.getAllAdmin); // antes de /:id
router.get("/", controller.getAll);          // público
router.get("/:id", controller.getById);      // público
router.post("/", ...admin, controller.create);
router.put("/:id", ...admin, controller.update);
router.patch("/:id", ...admin, controller.update);
router.delete("/:id", ...admin, controller.delete);

export default router;
