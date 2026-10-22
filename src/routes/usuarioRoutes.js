// =============================================================================
// src/routes/usuarioRoutes.js - Endpoints de /api/usuarios
// =============================================================================

import { Router } from "express";
import UsuarioService from "../services/UsuarioService.js";
import UsuarioController from "../controllers/UsuarioController.js";
import AuthMiddleware from "../middlewares/AuthMiddleware.js";

const { authenticate, authorize } = AuthMiddleware;
const router = Router();
const controller = new UsuarioController(new UsuarioService());

router.use(authenticate);

router.get("/", authorize("administrador"), controller.getAll);
router.post("/", authorize("administrador"), controller.create);
router.get("/:id", controller.getById);      // el servicio valida: propio o admin/trabajador
router.put("/:id", controller.update);       // propio (campos limitados) o admin
router.patch("/:id", controller.update);
router.delete("/:id", authorize("administrador"), controller.delete);

export default router;
