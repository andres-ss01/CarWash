// =============================================================================
// src/models/Horario.js - Horarios de atención (un registro por día de la semana)
// =============================================================================

import { database } from "../config/Database.js";

const DIAS = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const hhmm = (t) => String(t).slice(0, 5); // 'HH:MM:SS' -> 'HH:MM'

export default class Horario {
  static fromRow(row) {
    return {
      dia: row.dia_semana,
      diaNombre: DIAS[row.dia_semana],
      horaApertura: hhmm(row.hora_apertura),
      horaCierre: hhmm(row.hora_cierre),
    };
  }

  async findAll() {
    const rows = await database.query("SELECT * FROM HorarioAtencion ORDER BY dia_semana");
    return rows.map(Horario.fromRow);
  }

  // `bloquear = true` agrega FOR UPDATE: serializa las reservas de ese día dentro de una transacción
  async findByDia(dia, conn = null, bloquear = false) {
    const rows = await database.query(
      `SELECT * FROM HorarioAtencion WHERE dia_semana = ? ${bloquear ? "FOR UPDATE" : ""}`, [dia], conn);
    return rows.length ? Horario.fromRow(rows[0]) : null;
  }

  async upsert(h) {
    await database.query(
      `INSERT INTO HorarioAtencion (dia_semana, hora_apertura, hora_cierre) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE hora_apertura = VALUES(hora_apertura), hora_cierre = VALUES(hora_cierre)`,
      [h.dia, h.horaApertura, h.horaCierre]
    );
    return this.findByDia(h.dia);
  }

  // Quitar el horario de un día = el establecimiento no abre ese día
  async delete(dia) {
    const result = await database.query("DELETE FROM HorarioAtencion WHERE dia_semana = ?", [dia]);
    return result.affectedRows > 0;
  }
}
