// =============================================================================
// src/routes/tipoVehiculoRoutes.js - Endpoints de /api/tipos-vehiculo
// =============================================================================

import { Router } from "express";
import TipoVehiculoService from "../services/TipoVehiculoService.js";
import TipoVehiculoController from "../controllers/TipoVehiculoController.js";
import AuthMiddleware from "../middlewares/AuthMiddleware.js";

const { authenticate, authorize } = AuthMiddleware;
const router = Router();
const controller = new TipoVehiculoController(new TipoVehiculoService());

router.get("/", controller.getAll);          // público
router.get("/:id", controller.getById);      // público
router.post("/", authenticate, authorize("administrador"), controller.create);
router.put("/:id", authenticate, authorize("administrador"), controller.update);
router.patch("/:id", authenticate, authorize("administrador"), controller.update);
router.delete("/:id", authenticate, authorize("administrador"), controller.delete);

export default router;
