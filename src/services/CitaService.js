// =============================================================================
// src/services/CitaService.js - Agendamiento de citas
// -----------------------------------------------------------------------------
// Reglas al agendar:
//   1. Debe ser futura y caer dentro del HorarioAtencion de ese día (inicio y fin).
//   2. La duración total = suma de duracion_min de los servicios elegidos.
//   3. El precio de cada servicio se congela (precio_aplicado) según el tipo de vehículo.
//   4. No pueden traslaparse más de CITAS_SIMULTANEAS citas, ni dos del mismo vehículo.
//   5. Se bloquea el horario del día (FOR UPDATE) para que dos reservas simultáneas
//      no excedan la capacidad.
// =============================================================================

import { database } from "../config/Database.js";
import { config } from "../config/config.js";
import Cita from "../models/Cita.js";
import Vehiculo from "../models/Vehiculo.js";
import Servicio from "../models/Servicio.js";
import Horario from "../models/Horario.js";
import Notificacion from "../models/Notificacion.js";
import AppError from "../utils/AppError.js";
import { esStaff, exigirDuenoOStaff } from "../utils/permisos.js";
import {
  parseId, requireFields, requireEnum, optionalString, redondear, parseListOptions,
} from "../utils/validators.js";
import {
  parseFechaHora, addMinutes, formatFecha, formatHora, formatFechaHora, diaSemana,
  minutosDelDia, horaAMinutos, minutosAHora, ahoraLocal,
} from "../utils/fechas.js";

const ESTADOS = ["programada", "confirmada", "en_curso", "completada", "cancelada", "no_asistio"];

// Transiciones que puede hacer el staff a mano. en_curso y completada las gobierna la Orden.
const TRANSICIONES = {
  programada: ["confirmada", "cancelada", "no_asistio"],
  confirmada: ["cancelada", "no_asistio"],
};

export default class CitaService {
  constructor() {
    this.model = new Cita();
    this.vehiculoModel = new Vehiculo();
    this.servicioModel = new Servicio();
    this.horarioModel = new Horario();
    this.notificacionModel = new Notificacion();
  }

  // Lista los servicios únicos pedidos, como enteros
  parseServicios(servicios) {
    if (!Array.isArray(servicios) || servicios.length === 0) {
      throw new AppError("servicios debe ser un arreglo con al menos un idServicio", 400);
    }
    return [...new Set(servicios.map((s) => parseId(s, "idServicio")))];
  }

  async getAll(actor, query) {
    const { estado, fecha } = query || {};
    if (estado) requireEnum(estado, "estado", ESTADOS);
    if (fecha) parseFechaHora(fecha, "fecha"); // valida formato
    return this.model.findAll({
      idCliente: esStaff(actor) ? (query?.idCliente ? parseId(query.idCliente, "idCliente") : undefined) : actor.id,
      estado,
      fecha,
      ...parseListOptions(query),
    });
  }

  async getById(actor, id) {
    const cita = await this.model.findById(parseId(id));
    if (!cita) throw new AppError("Cita no encontrada", 404);
    exigirDuenoOStaff(actor, cita.cliente.id);
    return cita;
  }

  // POST /api/citas  { idVehiculo, fechaHoraInicio, servicios: [1,2], notas? }
  async crear(actor, data) {
    requireFields(data, ["idVehiculo", "fechaHoraInicio", "servicios"]);
    const ids = this.parseServicios(data.servicios);
    const inicio = parseFechaHora(data.fechaHoraInicio, "fechaHoraInicio");
    if (inicio <= ahoraLocal()) throw new AppError("La cita debe agendarse en una fecha y hora futuras", 400);

    const vehiculo = await this.vehiculoModel.findById(parseId(data.idVehiculo, "idVehiculo"));
    if (!vehiculo) throw new AppError("Vehículo no encontrado", 404);
    // El cliente solo agenda con sus vehículos; el staff agenda a nombre del dueño del vehículo
    exigirDuenoOStaff(actor, vehiculo.idCliente, "Ese vehículo no te pertenece");

    // Cotización: precio según tipo de vehículo + duración total
    const cotizacion = await this.servicioModel.findParaCotizar(ids, vehiculo.tipoVehiculo.id);
    if (cotizacion.length !== ids.length) throw new AppError("Alguno de los servicios no existe o está inactivo", 400);
    const sinPrecio = cotizacion.find((s) => s.precio === null);
    if (sinPrecio) {
      throw new AppError(`El servicio "${sinPrecio.nombre}" no tiene precio para ${vehiculo.tipoVehiculo.nombre}`, 400);
    }
    const duracion = cotizacion.reduce((acc, s) => acc + s.duracion_min, 0);
    const total = redondear(cotizacion.reduce((acc, s) => acc + Number(s.precio), 0));
    const fin = addMinutes(inicio, duracion);

    return database.transaction(async (conn) => {
      // Bloquea la fila del horario del día: serializa las reservas concurrentes
      const horario = await this.horarioModel.findByDia(diaSemana(inicio), conn, true);
      if (!horario) throw new AppError("El establecimiento no abre ese día", 400);

      const abre = horaAMinutos(horario.horaApertura);
      const cierra = horaAMinutos(horario.horaCierre);
      const mismoDia = formatFecha(fin) === formatFecha(inicio);
      if (minutosDelDia(inicio) < abre || !mismoDia || minutosDelDia(fin) > cierra) {
        throw new AppError(
          `Fuera de horario: ese día se atiende de ${horario.horaApertura} a ${horario.horaCierre} ` +
          `y tus servicios duran ${duracion} min`, 400);
      }

      const iniStr = formatFechaHora(inicio);
      const finStr = formatFechaHora(fin);

      if (await this.model.vehiculoOcupado(vehiculo.id, iniStr, finStr, conn)) {
        throw new AppError("Ese vehículo ya tiene una cita en ese horario", 409);
      }
      if ((await this.model.contarSolapadas(iniStr, finStr, conn)) >= config.citasSimultaneas) {
        throw new AppError("No hay disponibilidad en ese horario. Consulta /api/citas/disponibilidad", 409);
      }

      const idCita = await this.model.create({
        idCliente: vehiculo.idCliente,
        idVehiculo: vehiculo.id,
        fechaHoraInicio: iniStr,
        fechaHoraFin: finStr,
        totalEstimado: total,
        notas: optionalString(data.notas, "notas", { max: 255 }),
        servicios: cotizacion.map((s) => ({ idServicio: s.idServicio, precio: Number(s.precio) })),
      }, conn);

      await this.notificacionModel.create(
        vehiculo.idCliente, null,
        `Tu cita del ${formatFecha(inicio)} a las ${formatHora(inicio)} para ${vehiculo.marca} ${vehiculo.modelo} fue programada.`,
        conn);

      return this.model.findById(idCita, conn);
    });
  }

  // GET /api/citas/disponibilidad?fecha=2026-10-22&servicios=1,2
  async disponibilidad(query) {
    requireFields(query, ["fecha", "servicios"]);
    const dia = parseFechaHora(query.fecha, "fecha");
    const ids = this.parseServicios(String(query.servicios).split(",").map((s) => s.trim()));

    const duraciones = await this.servicioModel.findDuraciones(ids);
    if (duraciones.length !== ids.length) throw new AppError("Alguno de los servicios no existe o está inactivo", 400);
    const duracion = duraciones.reduce((acc, s) => acc + s.duracion_min, 0);

    const horario = await this.horarioModel.findByDia(diaSemana(dia));
    const base = { fecha: formatFecha(dia), duracionMin: duracion, capacidad: config.citasSimultaneas };
    if (!horario) return { ...base, abierto: false, horarios: [] };

    // Citas activas que tocan el día, en minutos desde las 00:00
    const ocupadas = (await this.model.findOcupadasEntre(
      `${base.fecha} 00:00:00`, `${formatFecha(addMinutes(dia, 1440))} 00:00:00`
    )).map((c) => {
      const ini = parseFechaHora(c.fecha_hora_inicio);
      const fin = parseFechaHora(c.fecha_hora_fin);
      return {
        ini: formatFecha(ini) === base.fecha ? minutosDelDia(ini) : 0,
        fin: formatFecha(fin) === base.fecha ? minutosDelDia(fin) : 1440,
      };
    });

    const ahora = ahoraLocal();
    const abre = horaAMinutos(horario.horaApertura);
    const cierra = horaAMinutos(horario.horaCierre);
    const horarios = [];
    for (let m = abre; m + duracion <= cierra; m += config.slotMin) {
      const enFuturo = addMinutes(dia, m) > ahora;
      const traslapes = ocupadas.filter((o) => o.ini < m + duracion && o.fin > m).length;
      horarios.push({
        inicio: minutosAHora(m),
        fin: minutosAHora(m + duracion),
        disponible: enFuturo && traslapes < config.citasSimultaneas,
      });
    }
    return { ...base, abierto: true, horario, horarios };
  }

  // PATCH /api/citas/:id/cancelar  (dueño o staff)
  async cancelar(actor, id) {
    const cita = await this.getById(actor, id);
    if (!["programada", "confirmada"].includes(cita.estado)) {
      throw new AppError(`No se puede cancelar una cita en estado "${cita.estado}"`, 409);
    }
    await database.transaction(async (conn) => {
      await this.model.updateEstado(cita.id, "cancelada", conn);
      await this.notificacionModel.create(
        cita.cliente.id, null, `Tu cita del ${cita.fechaHoraInicio.slice(0, 16)} fue cancelada.`, conn);
    });
    return this.model.findById(cita.id);
  }

  // PATCH /api/citas/:id/estado  (staff)  { estado }
  async cambiarEstado(id, data) {
    requireFields(data, ["estado"]);
    const estado = requireEnum(data.estado, "estado", ESTADOS);
    const cita = await this.model.findById(parseId(id));
    if (!cita) throw new AppError("Cita no encontrada", 404);

    if (!(TRANSICIONES[cita.estado] || []).includes(estado)) {
      throw new AppError(
        `Transición no permitida: ${cita.estado} -> ${estado}. ` +
        `(en_curso y completada se asignan al crear/avanzar la orden)`, 409);
    }
    const mensajes = {
      confirmada: `Tu cita del ${cita.fechaHoraInicio.slice(0, 16)} fue confirmada.`,
      cancelada: `Tu cita del ${cita.fechaHoraInicio.slice(0, 16)} fue cancelada por el establecimiento.`,
      no_asistio: `Tu cita del ${cita.fechaHoraInicio.slice(0, 16)} se marcó como no asistida.`,
    };
    await database.transaction(async (conn) => {
      await this.model.updateEstado(cita.id, estado, conn);
      await this.notificacionModel.create(cita.cliente.id, null, mensajes[estado], conn);
    });
    return this.model.findById(cita.id);
  }
}
