// =============================================================================
// src/routes/sugerenciaRoutes.js - Endpoints de /api/sugerencias
// =============================================================================

import { Router } from "express";
import SugerenciaService from "../services/SugerenciaService.js";
import SugerenciaController from "../controllers/SugerenciaController.js";
import AuthMiddleware from "../middlewares/AuthMiddleware.js";

const { authenticate, authorize } = AuthMiddleware;
const router = Router();
const controller = new SugerenciaController(new SugerenciaService());

router.use(authenticate);

router.get("/mias", authorize("trabajador", "administrador"), controller.getMias); // antes de /:id
router.get("/", authorize("administrador"), controller.getAll);
router.post("/generar", authorize("administrador"), controller.generar);
router.patch("/:id", authorize("trabajador", "administrador"), controller.responder);

export default router;
