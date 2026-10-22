// =============================================================================
// src/models/Cita.js - Modelo de Cita (agendamiento) y sus servicios (CitaServicio)
// =============================================================================

import { database } from "../config/Database.js";

const SELECT = `
  SELECT c.*, v.matricula, v.marca, v.modelo, u.nombre AS cli_nombre, u.apellidos AS cli_apellidos
    FROM Cita c
    JOIN Vehiculo v ON v.idVehiculo = c.idVehiculo
    JOIN Usuario  u ON u.idUsuario  = c.idCliente`;

// Estados que ocupan capacidad en la agenda
const ACTIVAS = "('programada','confirmada','en_curso')";

export default class Cita {
  static fromRow(row) {
    return {
      id: row.idCita,
      cliente: { id: row.idCliente, nombre: `${row.cli_nombre} ${row.cli_apellidos}` },
      vehiculo: { id: row.idVehiculo, matricula: row.matricula, descripcion: `${row.marca} ${row.modelo}` },
      fechaHoraInicio: row.fecha_hora_inicio,
      fechaHoraFin: row.fecha_hora_fin,
      estado: row.estado,
      totalEstimado: Number(row.total_estimado),
      notas: row.notas,
      fechaCreacion: row.fecha_creacion,
    };
  }

  async findAll({ idCliente, estado, fecha, limit, sort }) {
    const where = [];
    const params = [];
    if (idCliente) { where.push("c.idCliente = ?"); params.push(idCliente); }
    if (estado) { where.push("c.estado = ?"); params.push(estado); }
    if (fecha) { where.push("DATE(c.fecha_hora_inicio) = ?"); params.push(fecha); }

    let sql = `${SELECT} ${where.length ? "WHERE " + where.join(" AND ") : ""}
               ORDER BY c.fecha_hora_inicio ${sort === "desc" ? "DESC" : "ASC"}`;
    if (limit) { sql += " LIMIT ?"; params.push(limit); }
    const rows = await database.query(sql, params);
    return rows.map(Cita.fromRow);
  }

  // Detalle: incluye los servicios con el precio congelado al agendar
  async findById(id, conn = null) {
    const rows = await database.query(`${SELECT} WHERE c.idCita = ?`, [id], conn);
    if (!rows.length) return null;
    const cita = Cita.fromRow(rows[0]);
    const servicios = await database.query(
      `SELECT cs.idServicio, s.nombre, s.duracion_min, cs.precio_aplicado
         FROM CitaServicio cs JOIN Servicio s ON s.idServicio = cs.idServicio
        WHERE cs.idCita = ? ORDER BY cs.idServicio`, [id], conn);
    cita.servicios = servicios.map((s) => ({
      id: s.idServicio, nombre: s.nombre, duracionMin: s.duracion_min, precio: Number(s.precio_aplicado),
    }));
    return cita;
  }

  // Cuántas citas activas se traslapan con [inicio, fin)
  async contarSolapadas(inicio, fin, conn = null) {
    const rows = await database.query(
      `SELECT COUNT(*) AS n FROM Cita
        WHERE estado IN ${ACTIVAS} AND fecha_hora_inicio < ? AND fecha_hora_fin > ?`,
      [fin, inicio], conn);
    return rows[0].n;
  }

  async vehiculoOcupado(idVehiculo, inicio, fin, conn = null) {
    const rows = await database.query(
      `SELECT COUNT(*) AS n FROM Cita
        WHERE idVehiculo = ? AND estado IN ${ACTIVAS} AND fecha_hora_inicio < ? AND fecha_hora_fin > ?`,
      [idVehiculo, fin, inicio], conn);
    return rows[0].n > 0;
  }

  // Rangos ocupados de un día (para calcular disponibilidad)
  async findOcupadasEntre(desde, hasta) {
    return database.query(
      `SELECT fecha_hora_inicio, fecha_hora_fin FROM Cita
        WHERE estado IN ${ACTIVAS} AND fecha_hora_inicio < ? AND fecha_hora_fin > ?`,
      [hasta, desde]);
  }

  async calcularTotal(idCita, conn = null) {
    const rows = await database.query(
      "SELECT COALESCE(SUM(precio_aplicado), 0) AS total FROM CitaServicio WHERE idCita = ?", [idCita], conn);
    return Number(rows[0].total);
  }

  // `c.servicios` = [{ idServicio, precio }]
  async create(c, conn) {
    const result = await database.query(
      `INSERT INTO Cita (idCliente, idVehiculo, fecha_hora_inicio, fecha_hora_fin, total_estimado, notas)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [c.idCliente, c.idVehiculo, c.fechaHoraInicio, c.fechaHoraFin, c.totalEstimado, c.notas], conn);
    for (const s of c.servicios) {
      await database.query(
        "INSERT INTO CitaServicio (idCita, idServicio, precio_aplicado) VALUES (?, ?, ?)",
        [result.insertId, s.idServicio, s.precio], conn);
    }
    return result.insertId;
  }

  async updateEstado(id, estado, conn = null) {
    await database.query("UPDATE Cita SET estado = ? WHERE idCita = ?", [estado, id], conn);
  }
}
