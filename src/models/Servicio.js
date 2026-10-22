// =============================================================================
// src/models/Servicio.js - Catálogo de servicios + precios por tipo de vehículo
// -----------------------------------------------------------------------------
// JSON: { id, nombre, descripcion, duracionMin, activo,
//         precios: [{ idTipoVehiculo, tipoVehiculo, precio }] }
// =============================================================================

import { database } from "../config/Database.js";

export default class Servicio {
  static fromRow(row, precios = []) {
    return {
      id: row.idServicio,
      nombre: row.nombre,
      descripcion: row.descripcion,
      duracionMin: row.duracion_min,
      activo: Boolean(row.activo),
      precios: precios
        .filter((p) => p.idServicio === row.idServicio)
        .map((p) => ({ idTipoVehiculo: p.idTipoVehiculo, tipoVehiculo: p.tipo, precio: Number(p.precio) })),
    };
  }

  async #precios(ids, conn = null) {
    if (!ids.length) return [];
    return database.query(
      `SELECT sp.*, t.nombre AS tipo
         FROM ServicioPrecio sp JOIN TipoVehiculo t ON t.idTipoVehiculo = sp.idTipoVehiculo
        WHERE sp.idServicio IN (?) ORDER BY sp.idTipoVehiculo`,
      [ids], conn
    );
  }

  async findAll({ soloActivos = false, limit, sort } = {}) {
    const params = [];
    let sql = `SELECT * FROM Servicio ${soloActivos ? "WHERE activo = 1" : ""}
               ORDER BY idServicio ${sort === "desc" ? "DESC" : "ASC"}`;
    if (limit) { sql += " LIMIT ?"; params.push(limit); }
    const rows = await database.query(sql, params);
    const precios = await this.#precios(rows.map((r) => r.idServicio));
    return rows.map((r) => Servicio.fromRow(r, precios));
  }

  async findById(id, conn = null) {
    const rows = await database.query("SELECT * FROM Servicio WHERE idServicio = ?", [id], conn);
    if (!rows.length) return null;
    return Servicio.fromRow(rows[0], await this.#precios([id], conn));
  }

  // Servicios activos con su precio para un tipo de vehículo (precio = null si no está definido)
  async findParaCotizar(ids, idTipoVehiculo, conn = null) {
    return database.query(
      `SELECT s.idServicio, s.nombre, s.duracion_min, sp.precio
         FROM Servicio s
         LEFT JOIN ServicioPrecio sp ON sp.idServicio = s.idServicio AND sp.idTipoVehiculo = ?
        WHERE s.idServicio IN (?) AND s.activo = 1`,
      [idTipoVehiculo, ids], conn
    );
  }

  // Solo duraciones (para calcular disponibilidad sin saber el tipo de vehículo)
  async findDuraciones(ids) {
    return database.query(
      "SELECT idServicio, duracion_min FROM Servicio WHERE idServicio IN (?) AND activo = 1", [ids]);
  }

  async #guardarPrecios(idServicio, precios, conn) {
    await database.query("DELETE FROM ServicioPrecio WHERE idServicio = ?", [idServicio], conn);
    for (const p of precios) {
      await database.query(
        "INSERT INTO ServicioPrecio (idServicio, idTipoVehiculo, precio) VALUES (?, ?, ?)",
        [idServicio, p.idTipoVehiculo, p.precio], conn
      );
    }
  }

  async create(s) {
    return database.transaction(async (conn) => {
      const result = await database.query(
        "INSERT INTO Servicio (nombre, descripcion, duracion_min, activo) VALUES (?, ?, ?, ?)",
        [s.nombre, s.descripcion, s.duracionMin, s.activo ? 1 : 0], conn
      );
      await this.#guardarPrecios(result.insertId, s.precios, conn);
      return this.findById(result.insertId, conn);
    });
  }

  async update(id, s) {
    return database.transaction(async (conn) => {
      await database.query(
        "UPDATE Servicio SET nombre = ?, descripcion = ?, duracion_min = ?, activo = ? WHERE idServicio = ?",
        [s.nombre, s.descripcion, s.duracionMin, s.activo ? 1 : 0, id], conn
      );
      await this.#guardarPrecios(id, s.precios, conn);
      return this.findById(id, conn);
    });
  }

  // Baja lógica: CitaServicio referencia al servicio (RESTRICT) y debe conservarse el historial
  async desactivar(id) {
    const result = await database.query("UPDATE Servicio SET activo = 0 WHERE idServicio = ?", [id]);
    return result.affectedRows > 0;
  }
}
