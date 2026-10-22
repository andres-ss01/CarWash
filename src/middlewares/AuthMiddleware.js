// =============================================================================
// src/middlewares/AuthMiddleware.js - Autenticación (JWT) y autorización por rol
// -----------------------------------------------------------------------------
//   router.use(AuthMiddleware.authenticate);                  // exige sesión
//   router.post("/", AuthMiddleware.authorize("administrador"), ...);  // exige rol
// Tras authenticate, req.user = { id, rol, nombre }.
// =============================================================================

import jwt from "jsonwebtoken";
import Usuario from "../models/Usuario.js";
import AppError from "../utils/AppError.js";
import asyncHandler from "../utils/asyncHandler.js";
import { config } from "../config/config.js";

export default class AuthMiddleware {
  static usuarioModel = new Usuario();

  static authenticate = asyncHandler(async (req, res, next) => {
    const [scheme, token] = (req.headers.authorization || "").split(" ");
    if (scheme !== "Bearer" || !token) throw new AppError("Token requerido (Authorization: Bearer <token>)", 401);

    const payload = jwt.verify(token, config.jwtSecret);

    // Se consulta la BD para respetar usuarios desactivados o cambios de rol
    const usuario = await AuthMiddleware.usuarioModel.findById(Number(payload.sub));
    if (!usuario || !usuario.activo) throw new AppError("Sesión inválida", 401);

    req.user = { id: usuario.id, rol: usuario.rol, nombre: usuario.nombre };
    next();
  });

  static authorize = (...roles) => (req, res, next) => {
    if (!roles.includes(req.user?.rol)) {
      return next(new AppError("No tienes permiso para realizar esta acción", 403));
    }
    next();
  };
}
