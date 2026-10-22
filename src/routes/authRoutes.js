// =============================================================================
// src/routes/authRoutes.js - Endpoints de /api/auth
// =============================================================================

import { Router } from "express";
import AuthService from "../services/AuthService.js";
import AuthController from "../controllers/AuthController.js";
import AuthMiddleware from "../middlewares/AuthMiddleware.js";

const router = Router();
const controller = new AuthController(new AuthService());

router.post("/register", controller.register);
router.post("/login", controller.login);
router.get("/me", AuthMiddleware.authenticate, controller.me);

export default router;
