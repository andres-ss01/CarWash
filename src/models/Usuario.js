// =============================================================================
// src/models/Usuario.js - Modelo de Usuario (+ especializaciones)
// -----------------------------------------------------------------------------
// Usuario es la tabla padre; Cliente, Administrador y Trabajador la especializan.
// Crear/actualizar toca 2 tablas, por eso se hace dentro de una transacción.
// El hash de la contraseña NUNCA sale en el JSON (solo lo lee findAuthByCorreo).
// =============================================================================

import { database } from "../config/Database.js";

const SELECT = `
  SELECT u.*, COALESCE(a.rfc, t.rfc) AS rfc, COALESCE(a.curp, t.curp) AS curp, t.turno
    FROM Usuario u
    LEFT JOIN Administrador a ON a.idUsuario = u.idUsuario
    LEFT JOIN Trabajador   t ON t.idUsuario = u.idUsuario`;

export default class Usuario {
  static fromRow(row) {
    const usuario = {
      id: row.idUsuario,
      nombre: row.nombre,
      apellidos: row.apellidos,
      telefono: row.telefono,
      correo: row.correo,
      rol: row.rol,
      activo: Boolean(row.activo),
      fechaRegistro: row.fecha_registro,
    };
    if (row.rol === "administrador") usuario.perfil = { rfc: row.rfc, curp: row.curp };
    if (row.rol === "trabajador") usuario.perfil = { rfc: row.rfc, curp: row.curp, turno: row.turno };
    return usuario;
  }

  async findAll({ rol, activo, limit, sort }) {
    const where = [];
    const params = [];
    if (rol) { where.push("u.rol = ?"); params.push(rol); }
    if (activo !== undefined) { where.push("u.activo = ?"); params.push(activo ? 1 : 0); }

    let sql = `${SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""}
               ORDER BY u.idUsuario ${sort === "desc" ? "DESC" : "ASC"}`;
    if (limit) { sql += " LIMIT ?"; params.push(limit); }

    const rows = await database.query(sql, params);
    return rows.map(Usuario.fromRow);
  }

  async findById(id, conn = null) {
    const rows = await database.query(`${SELECT} WHERE u.idUsuario = ?`, [id], conn);
    return rows.length ? Usuario.fromRow(rows[0]) : null;
  }

  // Para el login: devuelve la fila cruda (incluye contrasena_hash)
  async findAuthByCorreo(correo) {
    const rows = await database.query(`${SELECT} WHERE u.correo = ?`, [correo]);
    return rows.length ? rows[0] : null;
  }

  async create(u) {
    return database.transaction(async (conn) => {
      const result = await database.query(
        `INSERT INTO Usuario (nombre, apellidos, telefono, correo, contrasena_hash, rol, activo)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [u.nombre, u.apellidos, u.telefono, u.correo, u.hash, u.rol, u.activo ? 1 : 0],
        conn
      );
      const id = result.insertId;

      if (u.rol === "cliente") {
        await database.query("INSERT INTO Cliente (idUsuario) VALUES (?)", [id], conn);
      } else if (u.rol === "administrador") {
        await database.query("INSERT INTO Administrador (idUsuario, rfc, curp) VALUES (?, ?, ?)",
          [id, u.perfil.rfc, u.perfil.curp], conn);
      } else {
        await database.query("INSERT INTO Trabajador (idUsuario, rfc, curp, turno) VALUES (?, ?, ?, ?)",
          [id, u.perfil.rfc, u.perfil.curp, u.perfil.turno], conn);
      }
      return this.findById(id, conn);
    });
  }

  // El rol no cambia. Si viene `hash`, también se actualiza la contraseña.
  async update(id, u) {
    return database.transaction(async (conn) => {
      const sets = ["nombre = ?", "apellidos = ?", "telefono = ?", "correo = ?", "activo = ?"];
      const params = [u.nombre, u.apellidos, u.telefono, u.correo, u.activo ? 1 : 0];
      if (u.hash) { sets.push("contrasena_hash = ?"); params.push(u.hash); }
      await database.query(`UPDATE Usuario SET ${sets.join(", ")} WHERE idUsuario = ?`, [...params, id], conn);

      if (u.rol === "administrador") {
        await database.query("UPDATE Administrador SET rfc = ?, curp = ? WHERE idUsuario = ?",
          [u.perfil.rfc, u.perfil.curp, id], conn);
      } else if (u.rol === "trabajador") {
        await database.query("UPDATE Trabajador SET rfc = ?, curp = ?, turno = ? WHERE idUsuario = ?",
          [u.perfil.rfc, u.perfil.curp, u.perfil.turno, id], conn);
      }
      return this.findById(id, conn);
    });
  }

  // Baja lógica: se conserva el historial de citas/órdenes/pagos del usuario
  async desactivar(id) {
    const result = await database.query("UPDATE Usuario SET activo = 0 WHERE idUsuario = ?", [id]);
    return result.affectedRows > 0;
  }
}
