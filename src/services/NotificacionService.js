// =============================================================================
// src/services/NotificacionService.js - Bandeja de notificaciones del usuario
// =============================================================================

import Notificacion from "../models/Notificacion.js";
import AppError from "../utils/AppError.js";
import { parseId, parseListOptions } from "../utils/validators.js";

export default class NotificacionService {
  constructor() {
    this.model = new Notificacion();
  }

  // ?leida=true|false  ?limit=  ?sort=asc|desc (por defecto, más recientes primero)
  async getMias(actor, query) {
    const { leida } = query || {};
    const opciones = parseListOptions(query);
    if (query?.sort === undefined) opciones.sort = "desc";
    const [notificaciones, noLeidas] = await Promise.all([
      this.model.findByUsuario(actor.id, {
        leida: leida === undefined ? undefined : leida === "true" || leida === "1",
        ...opciones,
      }),
      this.model.contarNoLeidas(actor.id),
    ]);
    return { noLeidas, notificaciones };
  }

  async marcarLeida(actor, id) {
    const ok = await this.model.marcarLeida(parseId(id), actor.id);
    if (!ok) throw new AppError("Notificación no encontrada", 404);
    return { message: "Notificación marcada como leída" };
  }

  async marcarTodasLeidas(actor) {
    const actualizadas = await this.model.marcarTodasLeidas(actor.id);
    return { message: "Notificaciones marcadas como leídas", actualizadas };
  }
}
