// =============================================================================
// src/services/UsuarioService.js - Lógica de negocio de Usuarios
// =============================================================================

import bcrypt from "bcryptjs";
import Usuario from "../models/Usuario.js";
import AppError from "../utils/AppError.js";
import { ROLES, esAdmin, exigirDuenoOStaff } from "../utils/permisos.js";
import {
  parseId, requireFields, requireString, requireEnum, requireEmail, requirePassword,
  parseListOptions, deepMerge,
} from "../utils/validators.js";
import { config } from "../config/config.js";

const TURNOS = ["matutino", "vespertino", "mixto"];

export default class UsuarioService {
  constructor() {
    this.model = new Usuario();
  }

  // Valida y normaliza. `conContrasena`: exigir/hashear contraseña (alta o cambio de contraseña)
  validate(data, { conContrasena = false } = {}) {
    requireFields(data, ["nombre", "apellidos", "telefono", "correo", "rol"]);
    const rol = requireEnum(data.rol, "rol", Object.values(ROLES));

    const usuario = {
      nombre: requireString(data.nombre, "nombre", { max: 40 }),
      apellidos: requireString(data.apellidos, "apellidos", { max: 50 }),
      telefono: requireString(String(data.telefono), "telefono", { min: 7, max: 20 }),
      correo: requireEmail(data.correo),
      rol,
      activo: data.activo === undefined ? true : Boolean(data.activo),
    };

    if (conContrasena) usuario.contrasena = requirePassword(data.contrasena);

    if (rol !== ROLES.CLIENTE) {
      requireFields(data, ["perfil.rfc", "perfil.curp"]);
      const rfc = String(data.perfil.rfc).trim().toUpperCase();
      const curp = String(data.perfil.curp).trim().toUpperCase();
      if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc)) throw new AppError("RFC inválido (12 o 13 caracteres)", 400);
      if (!/^[A-Z]{4}\d{6}[HMX][A-Z]{5}[A-Z0-9]\d$/.test(curp)) throw new AppError("CURP inválida (18 caracteres)", 400);
      usuario.perfil = { rfc, curp };
      if (rol === ROLES.TRABAJADOR) {
        requireFields(data, ["perfil.turno"]);
        usuario.perfil.turno = requireEnum(data.perfil.turno, "perfil.turno", TURNOS);
      }
    }
    return usuario;
  }

  async getAll(query) {
    const { rol, activo } = query || {};
    if (rol) requireEnum(rol, "rol", Object.values(ROLES));
    return this.model.findAll({
      rol,
      activo: activo === undefined ? undefined : activo === "true" || activo === "1",
      ...parseListOptions(query),
    });
  }

  async getById(actor, id) {
    const usuario = await this.model.findById(parseId(id));
    if (!usuario) throw new AppError("Usuario no encontrado", 404);
    exigirDuenoOStaff(actor, usuario.id);
    return usuario;
  }

  // Alta (la usa el admin y el registro público de clientes)
  async crear(data) {
    const usuario = this.validate(data, { conContrasena: true });
    const hash = await bcrypt.hash(usuario.contrasena, config.bcryptRounds);
    return this.model.create({ ...usuario, hash });
  }

  async update(actor, id, data) {
    const existing = await this.getById(actor, id); // 404 / 403
    if (!esAdmin(actor) && (data.activo !== undefined || data.perfil !== undefined)) {
      throw new AppError("Solo un administrador puede cambiar 'activo' o el perfil laboral", 403);
    }
    if (data.rol !== undefined && data.rol !== existing.rol) {
      throw new AppError("El rol de un usuario no se puede cambiar", 400);
    }

    const { contrasena, ...cambios } = data;
    const merged = deepMerge(existing, cambios);
    const validado = this.validate(
      { ...merged, ...(contrasena !== undefined && { contrasena }) },
      { conContrasena: contrasena !== undefined }
    );
    const hash = contrasena !== undefined ? await bcrypt.hash(validado.contrasena, config.bcryptRounds) : null;
    return this.model.update(existing.id, { ...validado, hash });
  }

  // Baja lógica (activo = 0). Conserva el historial de citas, órdenes y pagos.
  async desactivar(actor, id) {
    const usuario = await this.getById(actor, id);
    if (usuario.id === actor.id) throw new AppError("No puedes desactivar tu propia cuenta", 400);
    await this.model.desactivar(usuario.id);
    return { ...usuario, activo: false };
  }
}
