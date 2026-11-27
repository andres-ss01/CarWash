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

  // Clima para entrenar, por fecha en [desde, hasta]: el pronóstico de la víspera si existe
  // (ClimaPronostico, dias_antes = 1); si no, lo guardado en ClimaDia. Map fecha -> {...}
  async paraEntrenar(desde, hasta) {
    const dia = await database.query(
      "SELECT * FROM ClimaDia WHERE fecha BETWEEN ? AND ?", [desde, hasta]);
    let pron = [];
    try {
      pron = await database.query(
        "SELECT * FROM ClimaPronostico WHERE dias_antes = 1 AND fecha BETWEEN ? AND ?", [desde, hasta]);
    } catch (err) {
      console.error("Clima: sin ClimaPronostico (¿falta la migración 003?):", err.message);
    }
    const aObjeto = (r) => ({
      probLluvia: r.prob_lluvia,
      probMatutino: r.prob_lluvia_mat,
      probVespertino: r.prob_lluvia_vesp,
      precipitacionMm: r.precipitacion_mm === null ? null : Number(r.precipitacion_mm),
      tempMax: r.temp_max === null ? null : Number(r.temp_max),
    });
    const mapa = new Map(dia.map((r) => [String(r.fecha).slice(0, 10), aObjeto(r)]));
    for (const r of pron) mapa.set(String(r.fecha).slice(0, 10), aObjeto(r));
    return mapa;
  }

  // Foto del pronóstico de `c.fecha` tal como se veía el día `emitido` (una por día; gana la última lectura).
  // ClimaDia se sobrescribe con lo observado; esta tabla conserva lo que se pronosticaba (Fase 13).
  async guardarPronostico(c, emitido) {
    await database.query(
      `INSERT INTO ClimaPronostico (fecha, emitido, dias_antes, prob_lluvia, prob_lluvia_mat, prob_lluvia_vesp,
                                    precipitacion_mm, temp_max, viento_max, actualizado)
       VALUES (?, ?, DATEDIFF(?, ?), ?, ?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         prob_lluvia = VALUES(prob_lluvia), prob_lluvia_mat = VALUES(prob_lluvia_mat),
         prob_lluvia_vesp = VALUES(prob_lluvia_vesp), precipitacion_mm = VALUES(precipitacion_mm),
         temp_max = VALUES(temp_max), viento_max = VALUES(viento_max), actualizado = NOW()`,
      [c.fecha, emitido, c.fecha, emitido, c.probLluvia, c.probMatutino, c.probVespertino,
        c.precipitacionMm, c.tempMax, c.vientoMax]);
  }
}
