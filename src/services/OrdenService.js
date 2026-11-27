// =============================================================================
// src/services/OrdenService.js - Órdenes y seguimiento en tiempo real
// -----------------------------------------------------------------------------
// Flujo:  Cita -> (staff crea la orden al recibir el auto) -> estados en orden:
//   Recepción -> En Proceso -> Secado/Acabado -> Listo para Entrega
// Cada cambio: actualiza Orden, guarda HistorialEstadoOrden y notifica al cliente,
// todo en UNA transacción. Al llegar al último estado la cita queda "completada".
// =============================================================================

import { database } from "../config/Database.js";
import Orden from "../models/Orden.js";
import Cita from "../models/Cita.js";
import Usuario from "../models/Usuario.js";
import Notificacion from "../models/Notificacion.js";
import AppError from "../utils/AppError.js";
import { ROLES, exigirDuenoOStaff, esStaff } from "../utils/permisos.js";
import { parseId, parseListOptions, redondear } from "../utils/validators.js";

export default class OrdenService {
  constructor() {
    this.model = new Orden();
    this.citaModel = new Cita();
    this.usuarioModel = new Usuario();
    this.notificacionModel = new Notificacion();
  }

  async getAll(actor, query) {
    const { idEstadoOrden, abiertas } = query || {};
    return this.model.findAll({
      idCliente: esStaff(actor) ? undefined : actor.id,
      idEstadoOrden: idEstadoOrden ? parseId(idEstadoOrden, "idEstadoOrden") : undefined,
      soloAbiertas: abiertas === "true" || abiertas === "1",
      ...parseListOptions(query),
    });
  }

  async getEstados() {
    return this.model.findEstados();
  }

  async getById(actor, id) {
    const orden = await this.model.findById(parseId(id));
    if (!orden) throw new AppError("Orden no encontrada", 404);
    exigirDuenoOStaff(actor, orden.cliente.id);
    return orden;
  }

  // Lo que consume la barra de progreso de la app del cliente
  async getSeguimiento(actor, id) {
    const orden = await this.getById(actor, id); // valida existencia y permisos
    const seguimiento = await this.model.findSeguimiento(orden.id);
    const historial = await this.model.findHistorial(orden.id);
    const estados = await this.model.findEstados();
    return { ...seguimiento, estados, historial };
  }

  // POST /api/ordenes  { idCita }  (staff): el vehículo llegó
  async crear(actor, data) {
    const idCita = parseId(data?.idCita, "idCita");
    const cita = await this.citaModel.findById(idCita);
    if (!cita) throw new AppError("Cita no encontrada", 404);
    if (!["programada", "confirmada"].includes(cita.estado)) {
      throw new AppError(`No se puede crear una orden para una cita en estado "${cita.estado}"`, 409);
    }
    if (await this.model.findByCita(idCita)) throw new AppError("Esa cita ya tiene una orden", 409);

    return database.transaction(async (conn) => {
      const [inicial] = await this.model.findEstados(conn); // el de menor "orden"
      const total = await this.citaModel.calcularTotal(idCita, conn);

      const idOrden = await this.model.create({ idCita, idEstadoOrden: inicial.id, total }, conn);
      await this.model.addHistorial(idOrden, inicial.id, actor.id, conn);
      await this.citaModel.updateEstado(idCita, "en_curso", conn);
      await this.notificacionModel.create(
        cita.cliente.id, idOrden,
        `Recibimos tu vehículo ${cita.vehiculo.descripcion} (${cita.vehiculo.matricula}). Estado: ${inicial.nombre}.`,
        conn);

      return this.model.findById(idOrden, conn);
    });
  }

  // POST /api/ordenes/:id/avanzar  (staff): pasa al siguiente estado
  async avanzar(actor, id) {
    const orden = await this.getById(actor, id);
    if (orden.fechaTermino) throw new AppError("La orden ya llegó a su último estado", 409);

    return database.transaction(async (conn) => {
      const estados = await this.model.findEstados(conn);
      const siguiente = estados.find((e) => e.paso > orden.estado.paso);
      if (!siguiente) throw new AppError("La orden ya llegó a su último estado", 409);
      const esUltimo = siguiente.paso === estados[estados.length - 1].paso;

      // No se puede terminar sin cobrar: antes del último paso debe estar registrado el pago del total
      // (efectivo ya pagado, o tarjeta/transferencia registrada aunque falte confirmarla).
      if (esUltimo) {
        const [{ cobrado }] = await database.query(
          "SELECT COALESCE(SUM(monto), 0) AS cobrado FROM Pago WHERE idOrden = ? AND estado IN ('pagado', 'pendiente')",
          [orden.id], conn);
        const falta = redondear(orden.total - Number(cobrado));
        if (falta > 0) {
          throw new AppError(
            `Primero cobra la orden: faltan $${falta.toFixed(2)} de $${Number(orden.total).toFixed(2)}. ` +
            "Registra el pago y después termínala.", 409);
        }
      }

      await this.model.cambiarEstado(orden.id, siguiente.id, esUltimo, conn);
      await this.model.addHistorial(orden.id, siguiente.id, actor.id, conn);
      if (esUltimo) await this.citaModel.updateEstado(orden.idCita, "completada", conn);

      await this.notificacionModel.create(
        orden.cliente.id, orden.id,
        esUltimo
          ? `¡Tu vehículo ${orden.vehiculo.descripcion} está listo para entrega!`
          : `Tu vehículo ${orden.vehiculo.descripcion} avanzó a: ${siguiente.nombre}.`,
        conn);

      return this.model.findById(orden.id, conn);
    });
  }

  // POST /api/ordenes/:id/trabajadores  { idTrabajador }  (admin)
  async asignarTrabajador(id, data) {
    const orden = await this.model.findById(parseId(id));
    if (!orden) throw new AppError("Orden no encontrada", 404);
    const idTrabajador = parseId(data?.idTrabajador, "idTrabajador");
    const trabajador = await this.usuarioModel.findById(idTrabajador);
    if (!trabajador || trabajador.rol !== ROLES.TRABAJADOR || !trabajador.activo) {
      throw new AppError("El idTrabajador no corresponde a un trabajador activo", 400);
    }
    if (orden.trabajadores.some((t) => t.id === idTrabajador)) {
      throw new AppError("Ese trabajador ya está asignado a la orden", 409);
    }
    await this.model.asignarTrabajador(orden.id, idTrabajador);
    return this.model.findById(orden.id);
  }

  async quitarTrabajador(id, idTrabajador) {
    const orden = await this.model.findById(parseId(id));
    if (!orden) throw new AppError("Orden no encontrada", 404);
    const ok = await this.model.quitarTrabajador(orden.id, parseId(idTrabajador, "idTrabajador"));
    if (!ok) throw new AppError("Ese trabajador no está asignado a la orden", 404);
    return this.model.findById(orden.id);
  }
}
