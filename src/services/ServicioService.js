// =============================================================================
// src/services/ServicioService.js - Catálogo de servicios y precios
// =============================================================================

import Servicio from "../models/Servicio.js";
import TipoVehiculo from "../models/TipoVehiculo.js";
import AppError from "../utils/AppError.js";
import {
  parseId, requireFields, requireString, requireInt, requireNumber, parseListOptions, deepMerge,
} from "../utils/validators.js";

export default class ServicioService {
  constructor() {
    this.model = new Servicio();
    this.tipoModel = new TipoVehiculo();
  }

  async validate(data) {
    requireFields(data, ["nombre", "descripcion", "duracionMin"]);

    const precios = [];
    const vistos = new Set();
    if (data.precios !== undefined) {
      if (!Array.isArray(data.precios)) throw new AppError("precios debe ser un arreglo", 400);
      for (const p of data.precios) {
        requireFields(p, ["idTipoVehiculo", "precio"]);
        const idTipoVehiculo = parseId(p.idTipoVehiculo, "idTipoVehiculo");
        if (vistos.has(idTipoVehiculo)) throw new AppError("Hay tipos de vehículo repetidos en precios", 400);
        vistos.add(idTipoVehiculo);
        if (!(await this.tipoModel.findById(idTipoVehiculo))) {
          throw new AppError(`El tipo de vehículo ${idTipoVehiculo} no existe`, 400);
        }
        precios.push({ idTipoVehiculo, precio: requireNumber(p.precio, "precio", { min: 0 }) });
      }
    }

    return {
      nombre: requireString(data.nombre, "nombre", { max: 45 }),
      descripcion: requireString(data.descripcion, "descripcion", { max: 255 }),
      duracionMin: requireInt(data.duracionMin, "duracionMin", { min: 1, max: 1440 }),
      activo: data.activo === undefined ? true : Boolean(data.activo),
      precios,
    };
  }

  // Público: solo activos. Admin: todos (soloActivos = false)
  async getAll(query, { soloActivos = true } = {}) {
    return this.model.findAll({ soloActivos, ...parseListOptions(query) });
  }

  async getById(id) {
    const servicio = await this.model.findById(parseId(id));
    if (!servicio) throw new AppError("Servicio no encontrado", 404);
    return servicio;
  }

  async create(data) {
    return this.model.create(await this.validate(data));
  }

  // Si el body trae `precios`, reemplaza TODOS los precios; si no, conserva los actuales
  async update(id, data) {
    const existing = await this.getById(id);
    return this.model.update(existing.id, await this.validate(deepMerge(existing, data)));
  }

  async desactivar(id) {
    const servicio = await this.getById(id);
    await this.model.desactivar(servicio.id);
    return { ...servicio, activo: false };
  }
}
