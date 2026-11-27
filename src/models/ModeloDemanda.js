// =============================================================================
// src/models/ModeloDemanda.js - Modelos de ML entrenados (Fase 13)
// =============================================================================

import { database } from "../config/Database.js";

const leerJson = (v) => (typeof v === "string" ? JSON.parse(v) : v);

export default class ModeloDemanda {
  static fromRow(row, conParametros = true) {
    return {
      id: row.idModelo,
      version: row.version,
      entrenado: row.entrenado,
      muestras: row.muestras,
      desde: row.desde,
      hasta: row.hasta,
      maeModelo: row.mae_modelo === null ? null : Number(row.mae_modelo),
      maeReglas: row.mae_reglas === null ? null : Number(row.mae_reglas),
      activo: Boolean(row.activo),
      motivo: row.motivo,
      ...(conParametros ? { parametros: leerJson(row.parametros) } : {}),
    };
  }

  // Guarda un entrenamiento. Si `activo`, desactiva los anteriores (solo uno se usa a la vez).
  async guardar(r) {
    return database.transaction(async (conn) => {
      if (r.activo) await database.query("UPDATE ModeloDemanda SET activo = 0 WHERE activo = 1", [], conn);
      const res = await database.query(
        `INSERT INTO ModeloDemanda (version, muestras, desde, hasta, mae_modelo, mae_reglas, activo, motivo, parametros)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [r.modelo.version, r.muestras, r.desde ?? null, r.hasta ?? null, r.maeModelo ?? null, r.maeReglas ?? null,
          r.activo ? 1 : 0, r.motivo?.slice(0, 200) ?? null, JSON.stringify(r.modelo)],
        conn);
      return res.insertId;
    });
  }

  async activo() {
    const rows = await database.query(
      "SELECT * FROM ModeloDemanda WHERE activo = 1 ORDER BY entrenado DESC LIMIT 1");
    return rows.length ? ModeloDemanda.fromRow(rows[0]) : null;
  }

  async ultimo() {
    const rows = await database.query("SELECT * FROM ModeloDemanda ORDER BY idModelo DESC LIMIT 1");
    return rows.length ? ModeloDemanda.fromRow(rows[0]) : null;
  }

  async historial(limite = 20) {
    const rows = await database.query(
      `SELECT idModelo, version, entrenado, muestras, desde, hasta, mae_modelo, mae_reglas, activo, motivo
         FROM ModeloDemanda ORDER BY idModelo DESC LIMIT ${Number(limite) || 20}`);
    return rows.map((r) => ModeloDemanda.fromRow(r, false));
  }

  // Desactiva todos: vuelve a predecir con las reglas
  async desactivar() {
    await database.query("UPDATE ModeloDemanda SET activo = 0 WHERE activo = 1");
  }
}
