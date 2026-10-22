// =============================================================================
// src/routes/horarioRoutes.js - Endpoints de /api/horarios
// =============================================================================

import { Router } from "express";
import HorarioService from "../services/HorarioService.js";
import HorarioController from "../controllers/HorarioController.js";
import AuthMiddleware from "../middlewares/AuthMiddleware.js";

const { authenticate, authorize } = AuthMiddleware;
const router = Router();
const controller = new HorarioController(new HorarioService());

router.get("/", controller.getAll); // público
router.put("/:dia", authenticate, authorize("administrador"), controller.upsert);
router.delete("/:dia", authenticate, authorize("administrador"), controller.delete);

export default router;
