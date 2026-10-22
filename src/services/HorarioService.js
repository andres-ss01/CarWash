// =============================================================================
// src/services/HorarioService.js - Horarios de atención por día de la semana
// =============================================================================

import Horario from "../models/Horario.js";
import AppError from "../utils/AppError.js";
import { requireFields, requireInt } from "../utils/validators.js";
import { horaAMinutos } from "../utils/fechas.js";

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export default class HorarioService {
  constructor() {
    this.model = new Horario();
  }

  async getAll() {
    return this.model.findAll();
  }

  // Crea o reemplaza el horario de un día (1 = lunes ... 7 = domingo)
  async upsert(dia, data) {
    const diaNum = requireInt(dia, "dia", { min: 1, max: 7 });
    requireFields(data, ["horaApertura", "horaCierre"]);
    if (!HORA.test(data.horaApertura) || !HORA.test(data.horaCierre)) {
      throw new AppError("Las horas deben tener el formato HH:mm (24 h)", 400);
    }
    if (horaAMinutos(data.horaCierre) <= horaAMinutos(data.horaApertura)) {
      throw new AppError("horaCierre debe ser posterior a horaApertura", 400);
    }
    return this.model.upsert({ dia: diaNum, horaApertura: data.horaApertura, horaCierre: data.horaCierre });
  }

  async delete(dia) {
    const diaNum = requireInt(dia, "dia", { min: 1, max: 7 });
    const existente = await this.model.findByDia(diaNum);
    if (!existente) throw new AppError("Ese día no tiene horario registrado", 404);
    await this.model.delete(diaNum);
    return existente;
  }
}
