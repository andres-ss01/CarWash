// =============================================================================
// src/controllers/UsuarioController.js - Controlador de Usuarios
// =============================================================================

import asyncHandler from "../utils/asyncHandler.js";

export default class UsuarioController {
  constructor(usuarioService) {
    this.usuarioService = usuarioService;
  }

  // GET /api/usuarios?rol=trabajador&activo=true&limit=10&sort=desc   (admin)
  getAll = asyncHandler(async (req, res) => {
    res.status(200).json(await this.usuarioService.getAll(req.query));
  });

  // GET /api/usuarios/:id   (el propio usuario o admin)
  getById = asyncHandler(async (req, res) => {
    res.status(200).json(await this.usuarioService.getById(req.user, req.params.id));
  });

  // POST /api/usuarios   (admin)
  create = asyncHandler(async (req, res) => {
    res.status(201).json(await this.usuarioService.crear(req.body));
  });

  // PUT/PATCH /api/usuarios/:id
  update = asyncHandler(async (req, res) => {
    res.status(200).json(await this.usuarioService.update(req.user, req.params.id, req.body));
  });

  // DELETE /api/usuarios/:id   (admin) -> baja lógica
  delete = asyncHandler(async (req, res) => {
    const usuario = await this.usuarioService.desactivar(req.user, req.params.id);
    res.status(200).json({ message: "Usuario desactivado correctamente", usuario });
  });
}
