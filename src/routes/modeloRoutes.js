// =============================================================================
// src/routes/modeloRoutes.js - Endpoints de /api/modelo (solo administrador)
// =============================================================================

import { Router } from "express";
import ModeloService from "../services/ModeloService.js";
import ModeloController from "../controllers/ModeloController.js";
import AuthMiddleware from "../middlewares/AuthMiddleware.js";

const { authenticate, authorize } = AuthMiddleware;
const router = Router();
const controller = new ModeloController(new ModeloService());

router.use(authenticate, authorize("administrador"));

router.get("/", controller.estado);
router.get("/datos", controller.datos);
router.post("/entrenar", controller.entrenar);
router.post("/desactivar", controller.desactivar);
router.post("/clima-historico", controller.climaHistorico);

export default router;
