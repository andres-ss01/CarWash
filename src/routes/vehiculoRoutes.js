// =============================================================================
// src/routes/vehiculoRoutes.js - Endpoints de /api/vehiculos
// =============================================================================

import { Router } from "express";
import VehiculoService from "../services/VehiculoService.js";
import VehiculoController from "../controllers/VehiculoController.js";
import AuthMiddleware from "../middlewares/AuthMiddleware.js";

const router = Router();
const controller = new VehiculoController(new VehiculoService());

router.use(AuthMiddleware.authenticate);

router.get("/", controller.getAll);
router.get("/:id", controller.getById);
router.post("/", controller.create);
router.put("/:id", controller.update);
router.patch("/:id", controller.update);
router.delete("/:id", controller.delete);

export default router;
