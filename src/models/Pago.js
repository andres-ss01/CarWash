// =============================================================================
// src/models/Pago.js - Modelo de Pago
// -----------------------------------------------------------------------------
// Nunca se guarda el número completo de tarjeta: solo ultimos4 + la referencia
// de la pasarela de pago.
// =============================================================================

import { database } from "../config/Database.js";

const SELECT = `
  SELECT p.*, c.idCliente
    FROM Pago p
    JOIN Orden o ON o.idOrden = p.idOrden
    JOIN Cita  c ON c.idCita  = o.idCita`;

export default class Pago {
  static fromRow(row) {
    return {
      id: row.idPago,
      idOrden: row.idOrden,
      idCliente: row.idCliente,
      monto: Number(row.monto),
      metodo: row.metodo,
      estado: row.estado,
      fechaPago: row.fecha_pago,
      referencia: row.referencia,
      tarjeta: row.ultimos4 ? { ultimos4: row.ultimos4, marca: row.marca_tarjeta } : null,
    };
  }

  async findAll({ idOrden, idCliente, estado, limit, sort }) {
    const where = [];
    const params = [];
    if (idOrden) { where.push("p.idOrden = ?"); params.push(idOrden); }
    if (idCliente) { where.push("c.idCliente = ?"); params.push(idCliente); }
    if (estado) { where.push("p.estado = ?"); params.push(estado); }

    let sql = `${SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""}
               ORDER BY p.idPago ${sort === "desc" ? "DESC" : "ASC"}`;
    if (limit) { sql += " LIMIT ?"; params.push(limit); }
    const rows = await database.query(sql, params);
    return rows.map(Pago.fromRow);
  }

  async findById(id, conn = null) {
    const rows = await database.query(`${SELECT} WHERE p.idPago = ?`, [id], conn);
    return rows.length ? Pago.fromRow(rows[0]) : null;
  }

  async sumarPagado(idOrden, conn = null) {
    const rows = await database.query(
      "SELECT COALESCE(SUM(monto), 0) AS total FROM Pago WHERE idOrden = ? AND estado = 'pagado'", [idOrden], conn);
    return Number(rows[0].total);
  }

  async create(p, conn) {
    const result = await database.query(
      `INSERT INTO Pago (idOrden, monto, metodo, estado, fecha_pago, referencia, ultimos4, marca_tarjeta)
       VALUES (?, ?, ?, ?, IF(? = 'pagado', NOW(), NULL), ?, ?, ?)`,
      [p.idOrden, p.monto, p.metodo, p.estado, p.estado, p.referencia, p.ultimos4, p.marcaTarjeta], conn);
    return result.insertId;
  }

  async updateEstado(id, estado, conn) {
    await database.query(
      "UPDATE Pago SET estado = ?, fecha_pago = IF(? = 'pagado', NOW(), fecha_pago) WHERE idPago = ?",
      [estado, estado, id], conn);
  }
}
