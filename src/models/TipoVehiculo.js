// =============================================================================
// src/models/TipoVehiculo.js - Catálogo de tipos de vehículo (Auto, SUV, ...)
// =============================================================================

import { database } from "../config/Database.js";

export default class TipoVehiculo {
  static fromRow(row) {
    return { id: row.idTipoVehiculo, nombre: row.nombre };
  }

  async findAll() {
    const rows = await database.query("SELECT * FROM TipoVehiculo ORDER BY idTipoVehiculo");
    return rows.map(TipoVehiculo.fromRow);
  }

  async findById(id) {
    const rows = await database.query("SELECT * FROM TipoVehiculo WHERE idTipoVehiculo = ?", [id]);
    return rows.length ? TipoVehiculo.fromRow(rows[0]) : null;
  }

  async create(t) {
    const result = await database.query("INSERT INTO TipoVehiculo (nombre) VALUES (?)", [t.nombre]);
    return this.findById(result.insertId);
  }

  async update(id, t) {
    await database.query("UPDATE TipoVehiculo SET nombre = ? WHERE idTipoVehiculo = ?", [t.nombre, id]);
    return this.findById(id);
  }

  async delete(id) {
    const result = await database.query("DELETE FROM TipoVehiculo WHERE idTipoVehiculo = ?", [id]);
    return result.affectedRows > 0;
  }
}
