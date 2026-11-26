// =============================================================================
// src/routes/cronogramaRoutes.js - Endpoints de /api/cronograma
// =============================================================================

import { Router } from "express";
import CronogramaService from "../services/CronogramaService.js";
import CronogramaController from "../controllers/CronogramaController.js";
import AuthMiddleware from "../middlewares/AuthMiddleware.js";

const { authenticate, authorize } = AuthMiddleware;
const router = Router();
const controller = new CronogramaController(new CronogramaService());
const staff = authorize("administrador", "trabajador");
const admin = authorize("administrador");

router.use(authenticate);

router.get("/", staff, controller.getSemana);                        // admin: todos · trabajador: solo el suyo
router.post("/ausencia", staff, controller.registrarAusencia);       // "ausente solo hoy" (antes de /:idTrabajador)
router.delete("/ausencia/:fecha", staff, controller.quitarAusencia);
router.put("/:idTrabajador/excepciones/:fecha", admin, controller.setExcepcion);
router.delete("/:idTrabajador/excepciones/:fecha", admin, controller.quitarExcepcion);
router.put("/:idTrabajador/:dia", admin, controller.setPlantilla);   // plantilla semanal

export default router;
