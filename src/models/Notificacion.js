// =============================================================================
// src/models/Notificacion.js - Avisos de cita y cambios de estatus
// =============================================================================

import { database } from "../config/Database.js";

export default class Notificacion {
  static fromRow(row) {
    return {
      id: row.idNotificacion,
      idOrden: row.idOrden,
      mensaje: row.mensaje,
      leida: Boolean(row.leida),
      fecha: row.fecha,
    };
  }

  // Acepta `conn` para crearse dentro de la misma transacción que el evento que la origina
  async create(idUsuario, idOrden, mensaje, conn = null) {
    await database.query(
      "INSERT INTO Notificacion (idUsuario, idOrden, mensaje) VALUES (?, ?, ?)",
      [idUsuario, idOrden, mensaje.slice(0, 255)], conn);
  }

  async findByUsuario(idUsuario, { leida, limit, sort }) {
    const params = [idUsuario];
    let sql = "SELECT * FROM Notificacion WHERE idUsuario = ?";
    if (leida !== undefined) { sql += " AND leida = ?"; params.push(leida ? 1 : 0); }
    sql += ` ORDER BY idNotificacion ${sort === "asc" ? "ASC" : "DESC"}`; // más recientes primero
    if (limit) { sql += " LIMIT ?"; params.push(limit); }
    const rows = await database.query(sql, params);
    return rows.map(Notificacion.fromRow);
  }

  async contarNoLeidas(idUsuario) {
    const rows = await database.query(
      "SELECT COUNT(*) AS n FROM Notificacion WHERE idUsuario = ? AND leida = 0", [idUsuario]);
    return rows[0].n;
  }

  async marcarLeida(id, idUsuario) {
    const result = await database.query(
      "UPDATE Notificacion SET leida = 1 WHERE idNotificacion = ? AND idUsuario = ?", [id, idUsuario]);
    return result.affectedRows > 0;
  }

  async marcarTodasLeidas(idUsuario) {
    const result = await database.query(
      "UPDATE Notificacion SET leida = 1 WHERE idUsuario = ? AND leida = 0", [idUsuario]);
    return result.affectedRows;
  }
}
