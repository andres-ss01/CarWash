// =============================================================================
// src/routes/cronRoutes.js - Tareas programadas (solo las invoca el cron con CRON_SECRET)
// =============================================================================

import { Router } from "express";
import SugerenciaService from "../services/SugerenciaService.js";
import ClimaService from "../services/ClimaService.js";
import CronController from "../controllers/CronController.js";

const router = Router();
const controller = new CronController(new SugerenciaService(), new ClimaService());

router.get("/sugerencias", controller.autenticar, controller.sugerencias);

export default router;
