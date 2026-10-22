// =============================================================================
// src/services/PagoService.js - Pagos de órdenes
// -----------------------------------------------------------------------------
// Reglas:
//   - Nunca se acepta ni guarda el número completo de tarjeta ni el CVV.
//   - La suma de pagos "pagado" no puede superar el total de la orden.
//   - Efectivo se registra como pagado; tarjeta/transferencia requieren referencia
//     (y tarjeta, los últimos 4 dígitos). Se puede registrar como "pendiente".
//   - Transiciones: pendiente -> pagado | rechazado ; pagado -> reembolsado.
// =============================================================================

import { database } from "../config/Database.js";
import Pago from "../models/Pago.js";
import Orden from "../models/Orden.js";
import Notificacion from "../models/Notificacion.js";
import AppError from "../utils/AppError.js";
import { esStaff, exigirDuenoOStaff } from "../utils/permisos.js";
import {
  parseId, requireFields, requireNumber, requireEnum, optionalString, redondear, parseListOptions,
} from "../utils/validators.js";

const METODOS = ["efectivo", "tarjeta", "transferencia"];
const ESTADOS = ["pendiente", "pagado", "rechazado", "reembolsado"];
const PROHIBIDOS = ["numeroTarjeta", "numero", "pan", "cvv", "cvc", "vencimiento"];
const TRANSICIONES = { pendiente: ["pagado", "rechazado"], pagado: ["reembolsado"] };
const dinero = (n) => `$${n.toFixed(2)}`;

export default class PagoService {
  constructor() {
    this.model = new Pago();
    this.ordenModel = new Orden();
    this.notificacionModel = new Notificacion();
  }

  async getAll(actor, query) {
    const { idOrden, estado } = query || {};
    if (estado) requireEnum(estado, "estado", ESTADOS);
    return this.model.findAll({
      idOrden: idOrden ? parseId(idOrden, "idOrden") : undefined,
      idCliente: esStaff(actor) ? undefined : actor.id,
      estado,
      ...parseListOptions(query),
    });
  }

  async getById(actor, id) {
    const pago = await this.model.findById(parseId(id));
    if (!pago) throw new AppError("Pago no encontrado", 404);
    exigirDuenoOStaff(actor, pago.idCliente);
    return pago;
  }

  validate(data) {
    const prohibido = PROHIBIDOS.find((campo) => data?.[campo] !== undefined);
    if (prohibido) {
      throw new AppError(
        `No envíes datos sensibles de tarjeta ("${prohibido}"). Solo ultimos4 y la referencia de la pasarela.`, 400);
    }
    requireFields(data, ["idOrden", "monto", "metodo"]);

    const metodo = requireEnum(data.metodo, "metodo", METODOS);
    const monto = redondear(requireNumber(data.monto, "monto", { min: 0.01 }));
    const estado = data.estado === undefined
      ? (metodo === "efectivo" ? "pagado" : "pendiente")
      : requireEnum(data.estado, "estado", ["pendiente", "pagado", "rechazado"]);

    const pago = {
      idOrden: parseId(data.idOrden, "idOrden"), monto, metodo, estado,
      referencia: optionalString(data.referencia, "referencia", { max: 80 }),
      ultimos4: null, marcaTarjeta: null,
    };

    if (metodo === "tarjeta") {
      requireFields(data, ["ultimos4", "referencia"]);
      if (!/^\d{4}$/.test(String(data.ultimos4))) throw new AppError("ultimos4 debe tener exactamente 4 dígitos", 400);
      pago.ultimos4 = String(data.ultimos4);
      pago.marcaTarjeta = optionalString(data.marcaTarjeta, "marcaTarjeta", { max: 20 });
    } else if (metodo === "transferencia") {
      requireFields(data, ["referencia"]);
    }
    return pago;
  }

  // POST /api/pagos (staff)
  async crear(actor, data) {
    const pago = this.validate(data);

    return database.transaction(async (conn) => {
      const orden = await this.ordenModel.lockById(pago.idOrden, conn); // serializa pagos de la misma orden
      if (!orden) throw new AppError("Orden no encontrada", 404);

      if (pago.estado === "pagado") await this.#verificarSaldo(orden, pago.monto, conn);

      const id = await this.model.create(pago, conn);
      if (pago.estado === "pagado") {
        await this.notificacionModel.create(
          orden.idCliente, orden.id, `Recibimos tu pago de ${dinero(pago.monto)} (${pago.metodo}).`, conn);
      }
      return this.model.findById(id, conn);
    });
  }

  // PATCH /api/pagos/:id/estado (admin)  { estado }
  async cambiarEstado(id, data) {
    requireFields(data, ["estado"]);
    const estado = requireEnum(data.estado, "estado", ESTADOS);

    return database.transaction(async (conn) => {
      const pago = await this.model.findById(parseId(id), conn);
      if (!pago) throw new AppError("Pago no encontrado", 404);
      if (!(TRANSICIONES[pago.estado] || []).includes(estado)) {
        throw new AppError(`Transición no permitida: ${pago.estado} -> ${estado}`, 409);
      }
      const orden = await this.ordenModel.lockById(pago.idOrden, conn);
      if (estado === "pagado") await this.#verificarSaldo(orden, pago.monto, conn);

      await this.model.updateEstado(pago.id, estado, conn);
      if (estado === "reembolsado") {
        await this.notificacionModel.create(
          orden.idCliente, orden.id, `Se reembolsó tu pago de ${dinero(pago.monto)}.`, conn);
      }
      return this.model.findById(pago.id, conn);
    });
  }

  async #verificarSaldo(orden, monto, conn) {
    const pagado = await this.model.sumarPagado(orden.id, conn);
    const saldo = redondear(orden.total - pagado);
    if (monto > saldo) {
      throw new AppError(`El monto (${dinero(monto)}) excede el saldo pendiente de la orden (${dinero(saldo)})`, 400);
    }
  }
}
