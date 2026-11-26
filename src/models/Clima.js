// =============================================================================
// src/models/Clima.js - Clima diario (pronóstico y observado)
// =============================================================================

import { database } from "../config/Database.js";

export default class Clima {
  static fromRow(row) {
    return {
      fecha: row.fecha,
      probLluvia: row.prob_lluvia,
      turnos: {
        matutino: { probLluvia: row.prob_lluvia_mat },
        vespertino: { probLluvia: row.prob_lluvia_vesp },
      },
      precipitacionMm: row.precipitacion_mm,
      tempMax: row.temp_max,
      vientoMax: row.viento_max,
      observado: Boolean(row.observado),
      actualizado: row.actualizado,
    };
  }

  async find(fecha) {
    const rows = await database.query("SELECT * FROM ClimaDia WHERE fecha = ?", [fecha]);
    return rows.length ? Clima.fromRow(rows[0]) : null;
  }

  // Las probabilidades se conservan si la nueva lectura no las trae (los días pasados ya no las publican)
  async upsert(c) {
    await database.query(
      `INSERT INTO ClimaDia (fecha, prob_lluvia, prob_lluvia_mat, prob_lluvia_vesp, precipitacion_mm,
                             temp_max, viento_max, observado, actualizado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         prob_lluvia      = COALESCE(VALUES(prob_lluvia), prob_lluvia),
         prob_lluvia_mat  = COALESCE(VALUES(prob_lluvia_mat), prob_lluvia_mat),
         prob_lluvia_vesp = COALESCE(VALUES(prob_lluvia_vesp), prob_lluvia_vesp),
         precipitacion_mm = VALUES(precipitacion_mm), temp_max = VALUES(temp_max),
         viento_max = VALUES(viento_max), observado = VALUES(observado), actualizado = NOW()`,
      [c.fecha, c.probLluvia, c.probMatutino, c.probVespertino, c.precipitacionMm, c.tempMax, c.vientoMax,
        c.observado ? 1 : 0]);
  }
}
