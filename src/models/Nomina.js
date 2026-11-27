// =============================================================================
// src/models/Nomina.js - Pago por día y nómina semanal cerrada
// =============================================================================

import { database } from "../config/Database.js";

const leerJson = (v) => (typeof v === "string" ? JSON.parse(v) : v);

export default class Nomina {
  static fromRow(row) {
    return {
      idTrabajador: row.idTrabajador,
      nombre: row.nombre ? `${row.nombre} ${row.apellidos}` : undefined,
      semana: String(row.semana).slice(0, 10),
      diasCompletos: row.dias_completos,
      diasMedios: row.dias_medios,
      pagoDia: Number(row.pago_dia),
      total: Number(row.total),
      detalle: leerJson(row.detalle),
      cerrada: true,
      fechaCierre: row.cerrada,
    };
  }

  // Map idTrabajador -> pago por día (los que no tienen fila valen 0)
  async pagos() {
    const rows = await database.query("SELECT idTrabajador, pago_dia FROM PagoDiaTrabajador");
    return new Map(rows.map((r) => [r.idTrabajador, Number(r.pago_dia)]));
  }

  async setPago(idTrabajador, pagoDia) {
    await database.query(
      `INSERT INTO PagoDiaTrabajador (idTrabajador, pago_dia) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE pago_dia = VALUES(pago_dia)`,
      [idTrabajador, pagoDia]);
  }

  async findSemana(semana) {
    const rows = await database.query("SELECT * FROM NominaSemana WHERE semana = ?", [semana]);
    return rows.map(Nomina.fromRow);
  }

  // Guarda la semana cerrada; si ya existía no la toca (el historial no cambia)
  async cerrar(n) {
    await database.query(
      `INSERT IGNORE INTO NominaSemana
         (idTrabajador, semana, dias_completos, dias_medios, pago_dia, total, detalle)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [n.idTrabajador, n.semana, n.diasCompletos, n.diasMedios, n.pagoDia, n.total,
        JSON.stringify(n.detalle.map(({ futuro, ...d }) => d))]);
  }

  // Semanas cerradas, de la más reciente a la más vieja (todas o de un trabajador)
  async historial({ idTrabajador, limite = 12 }) {
    const where = idTrabajador ? "WHERE n.idTrabajador = ?" : "";
    const rows = await database.query(
      `SELECT n.*, u.nombre, u.apellidos FROM NominaSemana n
         JOIN Usuario u ON u.idUsuario = n.idTrabajador
         ${where}
        ORDER BY n.semana DESC, u.nombre ASC
        LIMIT ${Number(limite) || 12}`,
      idTrabajador ? [idTrabajador] : []);
    return rows.map(Nomina.fromRow);
  }
}
