// =============================================================================
// src/controllers/AuthController.js - Registro, login y perfil propio
// =============================================================================

import asyncHandler from "../utils/asyncHandler.js";

export default class AuthController {
  constructor(authService) {
    this.authService = authService; // Inyección de dependencias
  }

  // POST /api/auth/register
  register = asyncHandler(async (req, res) => {
    res.status(201).json(await this.authService.register(req.body));
  });

  // POST /api/auth/login
  login = asyncHandler(async (req, res) => {
    res.status(200).json(await this.authService.login(req.body));
  });

  // GET /api/auth/me
  me = asyncHandler(async (req, res) => {
    res.status(200).json(await this.authService.me(req.user));
  });
}
