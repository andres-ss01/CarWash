// =============================================================================
// src/routes/notificacionRoutes.js - Endpoints de /api/notificaciones
// =============================================================================

import { Router } from "express";
import NotificacionService from "../services/NotificacionService.js";
import NotificacionController from "../controllers/NotificacionController.js";
import AuthMiddleware from "../middlewares/AuthMiddleware.js";

const router = Router();
const controller = new NotificacionController(new NotificacionService());

router.use(AuthMiddleware.authenticate);

router.get("/", controller.getMias);
router.patch("/leer-todas", controller.marcarTodasLeidas); // antes de /:id
router.patch("/:id/leida", controller.marcarLeida);

export default router;
