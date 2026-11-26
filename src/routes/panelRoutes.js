// =============================================================================
// src/routes/panelRoutes.js - Endpoints de /api/panel
// =============================================================================

import { Router } from "express";
import PanelService from "../services/PanelService.js";
import PanelController from "../controllers/PanelController.js";
import AuthMiddleware from "../middlewares/AuthMiddleware.js";

const { authenticate, authorize } = AuthMiddleware;
const router = Router();
const controller = new PanelController(new PanelService());

router.use(authenticate);

router.get("/hoy", authorize("administrador"), controller.hoy);
router.get("/clima", authorize("administrador", "trabajador"), controller.clima);

export default router;
