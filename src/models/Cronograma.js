// =============================================================================
// src/models/Cronograma.js - Plantilla semanal y excepciones por fecha de los trabajadores
// -----------------------------------------------------------------------------
// Plantilla (CronogramaTrabajador): trabaja / descansa cada día de la semana. Sin fila = trabaja.
// Excepción (ExcepcionDia): cambio para UNA fecha; no toca la plantilla.
// =============================================================================

import { database } from "../config/Database.js";

export default class Cronograma {
  // Trabajadores activos y su situación en una fecha concreta (`dia`: 1 = lunes ... 7 = domingo)
  async estadoDia(fecha, dia, conn = null) {
    const rows = await database.query(
      `SELECT t.idUsuario, u.nombre, u.apellidos, t.turno,
              COALESCE(c.trabaja, 1) AS plantilla,
              e.estado AS excepcion, e.origen
         FROM Trabajador t
         JOIN Usuario u ON u.idUsuario = t.idUsuario AND u.activo = 1
         LEFT JOIN CronogramaTrabajador c ON c.idTrabajador = t.idUsuario AND c.dia_semana = ?
         LEFT JOIN ExcepcionDia e         ON e.idTrabajador = t.idUsuario AND e.fecha = ?
        ORDER BY t.idUsuario`,
      [dia, fecha], conn);
    return rows.map((r) => ({
      id: r.idUsuario,
      nombre: `${r.nombre} ${r.apellidos}`,
      turno: r.turno,
      plantilla: Boolean(r.plantilla),
      excepcion: r.excepcion,
      origen: r.origen,
      // La excepción manda sobre la plantilla
      trabaja: r.excepcion ? r.excepcion === "trabaja" : Boolean(r.plantilla),
    }));
  }

  async plantillas() {
    return database.query("SELECT idTrabajador, dia_semana, trabaja FROM CronogramaTrabajador");
  }

  async excepcionesEntre(desde, hasta) {
    return database.query(
      `SELECT idExcepcion, idTrabajador, fecha, estado, origen, nota
         FROM ExcepcionDia WHERE fecha BETWEEN ? AND ?`, [desde, hasta]);
  }

  async findExcepcion(idTrabajador, fecha, conn = null) {
    const rows = await database.query(
      "SELECT * FROM ExcepcionDia WHERE idTrabajador = ? AND fecha = ?", [idTrabajador, fecha], conn);
    return rows[0] || null;
  }

  async upsertPlantilla(idTrabajador, dia, trabaja) {
    await database.query(
      `INSERT INTO CronogramaTrabajador (idTrabajador, dia_semana, trabaja) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE trabaja = VALUES(trabaja)`,
      [idTrabajador, dia, trabaja ? 1 : 0]);
  }

  async upsertExcepcion({ idTrabajador, fecha, estado, origen, idSugerencia = null, nota = null }, conn = null) {
    await database.query(
      `INSERT INTO ExcepcionDia (idTrabajador, fecha, estado, origen, idSugerencia, nota)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE estado = VALUES(estado), origen = VALUES(origen),
                               idSugerencia = VALUES(idSugerencia), nota = VALUES(nota)`,
      [idTrabajador, fecha, estado, origen, idSugerencia, nota], conn);
  }

  async deleteExcepcion(idTrabajador, fecha) {
    const result = await database.query(
      "DELETE FROM ExcepcionDia WHERE idTrabajador = ? AND fecha = ?", [idTrabajador, fecha]);
    return result.affectedRows > 0;
  }

  // Cuántos días aceptó cada trabajador una sugerencia de ese `estado` en [desde, hasta). Para repartir con justicia.
  async contarPorSugerencia(estado, desde, hasta) {
    const rows = await database.query(
      `SELECT idTrabajador, COUNT(*) AS n FROM ExcepcionDia
        WHERE origen = 'sugerencia' AND estado = ? AND fecha >= ? AND fecha < ?
        GROUP BY idTrabajador`, [estado, desde, hasta]);
    return new Map(rows.map((r) => [r.idTrabajador, r.n]));
  }
}
