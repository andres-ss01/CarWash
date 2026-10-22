// =============================================================================
// src/services/AuthService.js - Registro, login y sesión (bcrypt + JWT)
// =============================================================================

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Usuario from "../models/Usuario.js";
import UsuarioService from "./UsuarioService.js";
import AppError from "../utils/AppError.js";
import { requireFields } from "../utils/validators.js";
import { config } from "../config/config.js";

export default class AuthService {
  constructor() {
    this.model = new Usuario();
    this.usuarioService = new UsuarioService();
  }

  firmarToken(usuario) {
    return jwt.sign({ rol: usuario.rol }, config.jwtSecret, {
      subject: String(usuario.id),
      expiresIn: config.jwtExpiresIn,
    });
  }

  // Auto-registro público: SIEMPRE crea un cliente (nunca admin/trabajador)
  async register(data) {
    const usuario = await this.usuarioService.crear({
      nombre: data?.nombre, apellidos: data?.apellidos, telefono: data?.telefono,
      correo: data?.correo, contrasena: data?.contrasena, rol: "cliente",
    });
    return { usuario, token: this.firmarToken(usuario) };
  }

  async login(data) {
    requireFields(data, ["correo", "contrasena"]);
    const row = await this.model.findAuthByCorreo(String(data.correo).trim().toLowerCase());
    const valido = row && (await bcrypt.compare(String(data.contrasena), row.contrasena_hash));
    if (!valido) throw new AppError("Correo o contraseña incorrectos", 401);
    if (!row.activo) throw new AppError("La cuenta está desactivada", 403);

    const usuario = Usuario.fromRow(row);
    return { usuario, token: this.firmarToken(usuario) };
  }

  async me(actor) {
    return this.usuarioService.getById(actor, actor.id);
  }
}
