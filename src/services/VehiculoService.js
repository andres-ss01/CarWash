// =============================================================================
// src/services/VehiculoService.js - Lógica de negocio de Vehículos
// -----------------------------------------------------------------------------
// Un cliente solo ve y administra SUS vehículos; el staff puede con todos.
// =============================================================================

import Vehiculo from "../models/Vehiculo.js";
import TipoVehiculo from "../models/TipoVehiculo.js";
import Usuario from "../models/Usuario.js";
import AppError from "../utils/AppError.js";
import { ROLES, esStaff, exigirDuenoOStaff } from "../utils/permisos.js";
import {
  parseId, requireFields, requireString, optionalString, requireInt, parseListOptions, deepMerge,
} from "../utils/validators.js";

export default class VehiculoService {
  constructor() {
    this.model = new Vehiculo();
    this.tipoModel = new TipoVehiculo();
    this.usuarioModel = new Usuario();
  }

  // Valida el vehículo. El dueño lo decide el actor (cliente) o el body (staff).
  async validate(actor, data) {
    requireFields(data, ["matricula", "marca", "modelo", "idTipoVehiculo"]);

    const idTipoVehiculo = parseId(data.idTipoVehiculo, "idTipoVehiculo");
    if (!(await this.tipoModel.findById(idTipoVehiculo))) throw new AppError("El tipo de vehículo no existe", 400);

    let idCliente;
    if (esStaff(actor)) {
      idCliente = parseId(data.idCliente, "idCliente");
      const cliente = await this.usuarioModel.findById(idCliente);
      if (!cliente || cliente.rol !== ROLES.CLIENTE) throw new AppError("El idCliente no corresponde a un cliente", 400);
    } else {
      idCliente = actor.id;
    }

    const anio = data.anio === undefined || data.anio === null || data.anio === ""
      ? null
      : requireInt(data.anio, "anio", { min: 1900, max: new Date().getFullYear() + 1 });

    return {
      matricula: requireString(data.matricula, "matricula", { min: 3, max: 11 }).toUpperCase().replace(/\s+/g, ""),
      marca: requireString(data.marca, "marca", { max: 30 }),
      modelo: requireString(data.modelo, "modelo", { max: 30 }),
      color: optionalString(data.color, "color", { max: 20 }),
      anio,
      idTipoVehiculo,
      idCliente,
    };
  }

  async getAll(actor, query) {
    const idCliente = esStaff(actor)
      ? (query?.idCliente ? parseId(query.idCliente, "idCliente") : undefined)
      : actor.id;
    return this.model.findAll({ idCliente, ...parseListOptions(query) });
  }

  async getById(actor, id) {
    const vehiculo = await this.model.findById(parseId(id));
    if (!vehiculo) throw new AppError("Vehículo no encontrado", 404);
    exigirDuenoOStaff(actor, vehiculo.idCliente);
    return vehiculo;
  }

  async create(actor, data) {
    return this.model.create(await this.validate(actor, data));
  }

  async update(actor, id, data) {
    const existing = await this.getById(actor, id);
    // Aplana tipoVehiculo -> idTipoVehiculo para poder fusionar con los cambios
    const base = { ...existing, idTipoVehiculo: existing.tipoVehiculo.id };
    delete base.tipoVehiculo;
    return this.model.update(existing.id, await this.validate(actor, deepMerge(base, data)));
  }

  async delete(actor, id) {
    const vehiculo = await this.getById(actor, id);
    if (await this.model.tieneCitas(vehiculo.id)) {
      throw new AppError("No se puede eliminar: el vehículo tiene citas registradas", 409);
    }
    await this.model.delete(vehiculo.id);
    return vehiculo;
  }
}
