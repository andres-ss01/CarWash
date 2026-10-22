// =============================================================================
// src/models/Orden.js - Órdenes, seguimiento en tiempo real y trabajadores asignados
// -----------------------------------------------------------------------------
// Orden (1 por cita) + EstadoOrden (catálogo ordenado) + HistorialEstadoOrden
// + OrdenTrabajador. "paso/totalPasos" alimentan la barra de progreso de la app.
// =============================================================================

import { database } from "../config/Database.js";
import { redondear } from "../utils/validators.js";

const SELECT = `
  SELECT o.*, e.nombre AS estado, e.orden AS paso,
         (SELECT MAX(orden) FROM EstadoOrden) AS total_pasos,
         c.idCliente, c.idVehiculo, c.fecha_hora_fin AS entrega_estimada,
         v.matricula, v.marca, v.modelo,
         u.nombre AS cli_nombre, u.apellidos AS cli_apellidos,
         (SELECT COALESCE(SUM(p.monto), 0) FROM Pago p
           WHERE p.idOrden = o.idOrden AND p.estado = 'pagado') AS pagado
    FROM Orden o
    JOIN EstadoOrden e ON e.idEstadoOrden = o.idEstadoOrden
    JOIN Cita c        ON c.idCita = o.idCita
    JOIN Vehiculo v    ON v.idVehiculo = c.idVehiculo
    JOIN Usuario u     ON u.idUsuario = c.idCliente`;

export default class Orden {
  static fromRow(row) {
    const total = Number(row.total);
    const pagado = Number(row.pagado);
    return {
      id: row.idOrden,
      idCita: row.idCita,
      estado: { id: row.idEstadoOrden, nombre: row.estado, paso: row.paso, totalPasos: row.total_pasos },
      cliente: { id: row.idCliente, nombre: `${row.cli_nombre} ${row.cli_apellidos}` },
      vehiculo: { id: row.idVehiculo, matricula: row.matricula, descripcion: `${row.marca} ${row.modelo}` },
      fechaInicio: row.fecha_inicio,
      fechaTermino: row.fecha_termino,
      entregaEstimada: row.entrega_estimada,
      total,
      pagado,
      saldo: redondear(total - pagado),
    };
  }

  async findAll({ idCliente, idEstadoOrden, soloAbiertas, limit, sort }) {
    const where = [];
    const params = [];
    if (idCliente) { where.push("c.idCliente = ?"); params.push(idCliente); }
    if (idEstadoOrden) { where.push("o.idEstadoOrden = ?"); params.push(idEstadoOrden); }
    if (soloAbiertas) where.push("o.fecha_termino IS NULL");

    let sql = `${SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""}
               ORDER BY o.idOrden ${sort === "desc" ? "DESC" : "ASC"}`;
    if (limit) { sql += " LIMIT ?"; params.push(limit); }
    const rows = await database.query(sql, params);
    return rows.map(Orden.fromRow);
  }

  // Detalle completo: servicios de la cita + trabajadores asignados
  async findById(id, conn = null) {
    const rows = await database.query(`${SELECT} WHERE o.idOrden = ?`, [id], conn);
    if (!rows.length) return null;
    const orden = Orden.fromRow(rows[0]);

    const servicios = await database.query(
      `SELECT cs.idServicio, s.nombre, cs.precio_aplicado
         FROM CitaServicio cs JOIN Servicio s ON s.idServicio = cs.idServicio
        WHERE cs.idCita = ? ORDER BY cs.idServicio`, [orden.idCita], conn);
    orden.servicios = servicios.map((s) => ({ id: s.idServicio, nombre: s.nombre, precio: Number(s.precio_aplicado) }));

    const trabajadores = await database.query(
      `SELECT t.idUsuario, u.nombre, u.apellidos, t.turno
         FROM OrdenTrabajador ot
         JOIN Trabajador t ON t.idUsuario = ot.idTrabajador
         JOIN Usuario u    ON u.idUsuario = t.idUsuario
        WHERE ot.idOrden = ?`, [id], conn);
    orden.trabajadores = trabajadores.map((t) => ({
      id: t.idUsuario, nombre: `${t.nombre} ${t.apellidos}`, turno: t.turno,
    }));
    return orden;
  }

  async findByCita(idCita, conn = null) {
    const rows = await database.query("SELECT idOrden FROM Orden WHERE idCita = ?", [idCita], conn);
    return rows.length ? rows[0].idOrden : null;
  }

  // Bloquea la fila de la orden (para registrar pagos sin condiciones de carrera)
  async lockById(id, conn) {
    const rows = await database.query(
      `SELECT o.idOrden, o.total, c.idCliente
         FROM Orden o JOIN Cita c ON c.idCita = o.idCita
        WHERE o.idOrden = ? FOR UPDATE`, [id], conn);
    return rows.length ? { id: rows[0].idOrden, total: Number(rows[0].total), idCliente: rows[0].idCliente } : null;
  }

  async create({ idCita, idEstadoOrden, total }, conn) {
    const result = await database.query(
      "INSERT INTO Orden (idCita, idEstadoOrden, total) VALUES (?, ?, ?)", [idCita, idEstadoOrden, total], conn);
    return result.insertId;
  }

  async cambiarEstado(idOrden, idEstadoOrden, terminar, conn) {
    await database.query(
      `UPDATE Orden SET idEstadoOrden = ?, fecha_termino = ${terminar ? "NOW()" : "fecha_termino"}
        WHERE idOrden = ?`, [idEstadoOrden, idOrden], conn);
  }

  // ----- Catálogo de estados -----
  async findEstados(conn = null) {
    const rows = await database.query("SELECT * FROM EstadoOrden ORDER BY orden", [], conn);
    return rows.map((e) => ({ id: e.idEstadoOrden, nombre: e.nombre, paso: e.orden }));
  }

  // ----- Historial (base del seguimiento) -----
  async addHistorial(idOrden, idEstadoOrden, idUsuario, conn) {
    await database.query(
      "INSERT INTO HistorialEstadoOrden (idOrden, idEstadoOrden, idUsuario) VALUES (?, ?, ?)",
      [idOrden, idEstadoOrden, idUsuario], conn);
  }

  async findHistorial(idOrden) {
    const rows = await database.query(
      `SELECT h.idHistorial, h.fecha_cambio, e.nombre AS estado, e.orden AS paso,
              h.idUsuario, CONCAT(u.nombre, ' ', u.apellidos) AS usuario
         FROM HistorialEstadoOrden h
         JOIN EstadoOrden e ON e.idEstadoOrden = h.idEstadoOrden
         LEFT JOIN Usuario u ON u.idUsuario = h.idUsuario
        WHERE h.idOrden = ? ORDER BY h.fecha_cambio, h.idHistorial`, [idOrden]);
    return rows.map((h) => ({
      estado: h.estado, paso: h.paso, fecha: h.fecha_cambio,
      realizadoPor: h.idUsuario ? { id: h.idUsuario, nombre: h.usuario } : null,
    }));
  }

  // Vista pensada para la barra de progreso del cliente
  async findSeguimiento(idOrden) {
    const rows = await database.query("SELECT * FROM vista_seguimiento_orden WHERE idOrden = ?", [idOrden]);
    if (!rows.length) return null;
    const r = rows[0];
    return {
      idOrden: r.idOrden,
      idCliente: r.idCliente,
      vehiculo: { matricula: r.matricula, descripcion: r.vehiculo },
      estadoActual: r.estado_actual,
      pasoActual: r.paso_actual,
      totalPasos: r.total_pasos,
      progreso: Math.round((r.paso_actual / r.total_pasos) * 100),
      fechaInicio: r.fecha_inicio,
      fechaTermino: r.fecha_termino,
      entregaEstimada: r.entrega_estimada,
    };
  }

  // ----- Trabajadores asignados -----
  async asignarTrabajador(idOrden, idTrabajador) {
    await database.query("INSERT INTO OrdenTrabajador (idOrden, idTrabajador) VALUES (?, ?)", [idOrden, idTrabajador]);
  }

  async quitarTrabajador(idOrden, idTrabajador) {
    const result = await database.query(
      "DELETE FROM OrdenTrabajador WHERE idOrden = ? AND idTrabajador = ?", [idOrden, idTrabajador]);
    return result.affectedRows > 0;
  }
}
