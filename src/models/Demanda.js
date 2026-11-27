// =============================================================================
// src/models/Demanda.js - Historial de lavados y predicciones de demanda por turno
// =============================================================================

import { database } from "../config/Database.js";

export default class Demanda {
  // Fecha ("YYYY-MM-DD") de la primera cita registrada, o null si aún no hay ninguna
  async primeraCita() {
    const rows = await database.query("SELECT DATE(MIN(fecha_hora_inicio)) AS d FROM Cita");
    return rows[0]?.d || null;
  }

  // Lavados (citas no canceladas) de un día de la semana (1 = lunes) dentro de una franja horaria,
  // entre `desde` (incluida) y `hasta` (excluida)
  async lavadosEntre({ desde, hasta, dia, horaInicio, horaFin }) {
    const rows = await database.query(
      `SELECT COUNT(*) AS n FROM Cita
        WHERE fecha_hora_inicio >= ? AND fecha_hora_inicio < ?
          AND estado NOT IN ('cancelada', 'no_asistio')
          AND WEEKDAY(fecha_hora_inicio) + 1 = ?
          AND HOUR(fecha_hora_inicio) >= ? AND HOUR(fecha_hora_inicio) < ?`,
      [desde, hasta, dia, horaInicio, horaFin]);
    return rows[0].n;
  }

  // ---- Fase 13: datos para el modelo de machine learning ----

  // Citas que ya estaban agendadas en `corte` ("YYYY-MM-DD HH:mm:ss") para esa fecha y franja horaria
  async agendadasAntes({ fecha, horaInicio, horaFin, corte }) {
    const rows = await database.query(
      `SELECT COUNT(*) AS n FROM Cita
        WHERE DATE(fecha_hora_inicio) = ? AND estado NOT IN ('cancelada', 'no_asistio')
          AND HOUR(fecha_hora_inicio) >= ? AND HOUR(fecha_hora_inicio) < ?
          AND fecha_creacion < ?`,
      [fecha, horaInicio, horaFin, corte]);
    return rows[0].n;
  }

  // Lavados por fecha y hora en [desde, hasta), en UNA consulta. `agendadas` = las que ya existían
  // la víspera a las `horaCorte` (lo que el sistema sabía al predecir).
  async conteosPorHora({ desde, hasta, horaCorte = 18 }) {
    return database.query(
      `SELECT DATE_FORMAT(fecha_hora_inicio, '%Y-%m-%d') AS fecha, HOUR(fecha_hora_inicio) AS hora,
              COUNT(*) AS total,
              SUM(fecha_creacion < DATE_ADD(DATE_SUB(DATE(fecha_hora_inicio), INTERVAL 1 DAY), INTERVAL ? HOUR)) AS agendadas
         FROM Cita
        WHERE fecha_hora_inicio >= ? AND fecha_hora_inicio < ?
          AND estado NOT IN ('cancelada', 'no_asistio')
        GROUP BY fecha, hora`,
      [horaCorte, desde, hasta]);
  }

  async upsertPrediccion({ fecha, turno, lavados, necesarios, metodo }) {
    await database.query(
      `INSERT INTO PrediccionDemanda (fecha, turno, lavados_estimados, trabajadores_necesarios, metodo, actualizado)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE lavados_estimados = VALUES(lavados_estimados),
         trabajadores_necesarios = VALUES(trabajadores_necesarios), metodo = VALUES(metodo), actualizado = NOW()`,
      [fecha, turno, lavados, necesarios, metodo]);
  }

  // { matutino: { lavadosEstimados, necesarios, metodo }, vespertino: {...} } (solo los turnos que existan)
  async findPredicciones(fecha, conn = null) {
    const rows = await database.query("SELECT * FROM PrediccionDemanda WHERE fecha = ?", [fecha], conn);
    return Object.fromEntries(rows.map((r) => [r.turno, {
      lavadosEstimados: r.lavados_estimados, necesarios: r.trabajadores_necesarios, metodo: r.metodo,
    }]));
  }

  async findPrediccionesEntre(desde, hasta) {
    return database.query(
      "SELECT * FROM PrediccionDemanda WHERE fecha BETWEEN ? AND ?", [desde, hasta]);
  }
}
