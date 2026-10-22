// =============================================================================
// src/services/TipoVehiculoService.js - Catálogo de tipos de vehículo
// =============================================================================

import TipoVehiculo from "../models/TipoVehiculo.js";
import AppError from "../utils/AppError.js";
import { parseId, requireFields, requireString } from "../utils/validators.js";

export default class TipoVehiculoService {
  constructor() {
    this.model = new TipoVehiculo();
  }

  validate(data) {
    requireFields(data, ["nombre"]);
    return { nombre: requireString(data.nombre, "nombre", { max: 40 }) };
  }

  async getAll() {
    return this.model.findAll();
  }

  async getById(id) {
    const tipo = await this.model.findById(parseId(id));
    if (!tipo) throw new AppError("Tipo de vehículo no encontrado", 404);
    return tipo;
  }

  async create(data) {
    return this.model.create(this.validate(data));
  }

  async update(id, data) {
    const existing = await this.getById(id);
    return this.model.update(existing.id, this.validate({ ...existing, ...data }));
  }

  // Si hay vehículos de este tipo, MySQL lo impide (FK RESTRICT) y el handler responde 409
  async delete(id) {
    const tipo = await this.getById(id);
    await this.model.delete(tipo.id);
    return tipo;
  }
}
