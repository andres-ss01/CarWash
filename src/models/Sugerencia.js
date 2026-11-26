// =============================================================================
// src/models/Sugerencia.js - Sugerencias de descansar / trabajar para el personal
// =============================================================================

import { database } from "../config/Database.js";

const SELECT = `
  SELECT s.*, u.nombre, u.apellidos
    FROM Sugerencia s
    JOIN Usuario u ON u.idUsuario = s.idTrabajador`;

export default class Sugerencia {
  static fromRow(row) {
    return {
      id: row.idSugerencia,
      trabajador: { id: row.idTrabajador, nombre: `${row.nombre} ${row.apellidos}` },
      fecha: row.fecha,
      tipo: row.tipo,
      motivo: row.motivo,
      estado: row.estado,
      fechaCreacion: row.fecha_creacion,
      fechaRespuesta: row.fecha_respuesta,
    };
  }

  async findAll({ idTrabajador, fecha, estado, desde }) {
    const where = [];
    const params = [];
    if (idTrabajador) { where.push("s.idTrabajador = ?"); params.push(idTrabajador); }
    if (fecha) { where.push("s.fecha = ?"); params.push(fecha); }
    if (desde) { where.push("s.fecha >= ?"); params.push(desde); }
    if (estado) { where.push("s.estado = ?"); params.push(estado); }
    const rows = await database.query(
      `${SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY s.fecha ASC, s.idSugerencia ASC`, params);
    return rows.map(Sugerencia.fromRow);
  }

  async findById(id, conn = null) {
    const rows = await database.query(`${SELECT} WHERE s.idSugerencia = ?`, [id], conn);
    return rows.length ? Sugerencia.fromRow(rows[0]) : null;
  }

  // INSERT IGNORE: si ya existe una sugerencia de ese trabajador para esa fecha, no hace nada.
  // Devuelve el id nuevo o null.
  async create({ idTrabajador, fecha, tipo, motivo }, conn = null) {
    const result = await database.query(
      "INSERT IGNORE INTO Sugerencia (idTrabajador, fecha, tipo, motivo) VALUES (?, ?, ?, ?)",
      [idTrabajador, fecha, tipo, motivo.slice(0, 200)], conn);
    return result.affectedRows > 0 ? result.insertId : null;
  }

  async responder(id, estado, conn = null) {
    await database.query(
      "UPDATE Sugerencia SET estado = ?, fecha_respuesta = NOW() WHERE idSugerencia = ?", [estado, id], conn);
  }

  // Las pendientes de días ya pasados dejan de tener sentido
  async expirarAnteriores(hoy) {
    const result = await database.query(
      "UPDATE Sugerencia SET estado = 'expirada' WHERE estado = 'pendiente' AND fecha < ?", [hoy]);
    return result.affectedRows;
  }

  async expirarDelTrabajador(idTrabajador, fecha, conn = null) {
    await database.query(
      "UPDATE Sugerencia SET estado = 'expirada' WHERE idTrabajador = ? AND fecha = ? AND estado = 'pendiente'",
      [idTrabajador, fecha], conn);
  }

  // Serializa las respuestas de un mismo día (dentro de una transacción) para no bajar del mínimo de lavadores
  async bloquearFecha(fecha, conn) {
    await database.query("SELECT idSugerencia FROM Sugerencia WHERE fecha = ? FOR UPDATE", [fecha], conn);
  }

  async contarPendientes(fecha) {
    const rows = await database.query(
      "SELECT COUNT(*) AS n FROM Sugerencia WHERE fecha = ? AND estado = 'pendiente'", [fecha]);
    return rows[0].n;
  }
}
