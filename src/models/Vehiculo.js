// =============================================================================
// src/models/Vehiculo.js - Modelo de Vehículo
// =============================================================================

import { database } from "../config/Database.js";

const SELECT = `
  SELECT v.*, t.nombre AS tipo
    FROM Vehiculo v
    JOIN TipoVehiculo t ON t.idTipoVehiculo = v.idTipoVehiculo`;

export default class Vehiculo {
  static fromRow(row) {
    return {
      id: row.idVehiculo,
      matricula: row.matricula,
      marca: row.marca,
      modelo: row.modelo,
      color: row.color,
      anio: row.anio,
      tipoVehiculo: { id: row.idTipoVehiculo, nombre: row.tipo },
      idCliente: row.idCliente,
    };
  }

  async findAll({ idCliente, limit, sort }) {
    const params = [];
    let sql = SELECT;
    if (idCliente) { sql += " WHERE v.idCliente = ?"; params.push(idCliente); }
    sql += ` ORDER BY v.idVehiculo ${sort === "desc" ? "DESC" : "ASC"}`;
    if (limit) { sql += " LIMIT ?"; params.push(limit); }
    const rows = await database.query(sql, params);
    return rows.map(Vehiculo.fromRow);
  }

  async findById(id, conn = null) {
    const rows = await database.query(`${SELECT} WHERE v.idVehiculo = ?`, [id], conn);
    return rows.length ? Vehiculo.fromRow(rows[0]) : null;
  }

  async create(v) {
    const result = await database.query(
      `INSERT INTO Vehiculo (matricula, marca, modelo, color, anio, idTipoVehiculo, idCliente)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [v.matricula, v.marca, v.modelo, v.color, v.anio, v.idTipoVehiculo, v.idCliente]
    );
    return this.findById(result.insertId);
  }

  async update(id, v) {
    await database.query(
      `UPDATE Vehiculo SET matricula = ?, marca = ?, modelo = ?, color = ?, anio = ?,
                           idTipoVehiculo = ?, idCliente = ?
        WHERE idVehiculo = ?`,
      [v.matricula, v.marca, v.modelo, v.color, v.anio, v.idTipoVehiculo, v.idCliente, id]
    );
    return this.findById(id);
  }

  async delete(id) {
    const result = await database.query("DELETE FROM Vehiculo WHERE idVehiculo = ?", [id]);
    return result.affectedRows > 0;
  }

  // La FK Cita->Vehiculo es ON DELETE CASCADE: borrar un vehículo borraría su historial.
  async tieneCitas(id) {
    const rows = await database.query("SELECT COUNT(*) AS n FROM Cita WHERE idVehiculo = ?", [id]);
    return rows[0].n > 0;
  }
}
