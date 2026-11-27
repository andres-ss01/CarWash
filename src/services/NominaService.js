// =============================================================================
// src/services/NominaService.js - Pago por día y nómina semanal de los trabajadores
// -----------------------------------------------------------------------------
//   - El administrador define el pago por día de cada trabajador.
//   - La semana (lunes a domingo) se calcula con el cronograma: días trabajados = pago completo,
//     descanso aceptado por sugerencia del sistema = medio pago (ver utils/nomina.js).
//   - Cuando la semana termina se "cierra": se guarda en NominaSemana y ya no cambia.
//     Lo cierra el cron diario y, por si acaso, cualquier consulta de una semana pasada.
// =============================================================================

import Nomina from "../models/Nomina.js";
import Usuario from "../models/Usuario.js";
import CronogramaService, { normalizarFecha } from "./CronogramaService.js";
import AppError from "../utils/AppError.js";
import { ROLES, esAdmin } from "../utils/permisos.js";
import { parseId, requireNumber, redondear } from "../utils/validators.js";
import { calcularSemana } from "../utils/nomina.js";
import { hoyLocal, sumarDias, diaSemana, parseFechaHora } from "../utils/fechas.js";

const ADMIN_SISTEMA = { id: 0, rol: ROLES.ADMIN }; // para cerrar semanas sin un usuario real

export const lunesDe = (fecha) => sumarDias(fecha, -(diaSemana(parseFechaHora(fecha)) - 1));

export default class NominaService {
  constructor() {
    this.model = new Nomina();
    this.usuarioModel = new Usuario();
    this.cronogramaService = new CronogramaService();
  }

  // Calcula (sin guardar) la nómina de la semana para lo que el actor puede ver
  async calcular(actor, lunes) {
    const [semana, pagos] = await Promise.all([
      this.cronogramaService.getSemana(actor, { semana: lunes }),
      this.model.pagos(),
    ]);
    const cerrados = new Set(semana.dias.filter((d) => d.cerrado).map((d) => d.fecha));
    const hoy = hoyLocal();
    return semana.trabajadores.map((t) => ({
      idTrabajador: t.id,
      nombre: t.nombre,
      semana: lunes,
      cerrada: false,
      ...calcularSemana({ dias: t.dias, cerrados, pagoDia: pagos.get(t.id) ?? 0, hoy }),
    }));
  }

  // Guarda la semana si ya terminó (idempotente: lo ya cerrado no se modifica)
  async cerrarSemana(lunes) {
    if (sumarDias(lunes, 6) >= hoyLocal()) return 0; // aún no termina
    const filas = await this.calcular(ADMIN_SISTEMA, lunes);
    for (const f of filas) await this.model.cerrar(f);
    return filas.length;
  }

  // El cron diario cierra la semana pasada
  async cerrarSemanaPasada() {
    return this.cerrarSemana(lunesDe(sumarDias(hoyLocal(), -7)));
  }

  // GET /api/nomina?semana=YYYY-MM-DD   (admin: todos · trabajador: la suya)
  async semana(actor, query) {
    const lunes = lunesDe(query?.semana ? normalizarFecha(query.semana, "semana") : hoyLocal());
    const terminada = sumarDias(lunes, 6) < hoyLocal();
    let filas;
    if (terminada) {
      await this.cerrarSemana(lunes);
      filas = await this.model.findSemana(lunes);
      if (!esAdmin(actor)) filas = filas.filter((f) => f.idTrabajador === actor.id);
      // nombre para las cerradas
      const vivos = new Map((await this.calcular(actor, lunes)).map((f) => [f.idTrabajador, f.nombre]));
      filas = filas.map((f) => ({ ...f, nombre: f.nombre ?? vivos.get(f.idTrabajador) ?? "" }));
    } else {
      filas = await this.calcular(actor, lunes);
    }
    return {
      semana: lunes,
      hasta: sumarDias(lunes, 6),
      terminada,
      trabajadores: filas,
      total: redondear(filas.reduce((s, f) => s + f.total, 0)),
    };
  }

  // GET /api/nomina/historial?limite=&idTrabajador=   (semanas cerradas)
  async historial(actor, query) {
    await this.cerrarSemanaPasada();
    const idTrabajador = esAdmin(actor)
      ? (query?.idTrabajador ? parseId(query.idTrabajador, "idTrabajador") : undefined)
      : actor.id;
    const limite = Math.min(Number(query?.limite) || 12, 104);
    return this.model.historial({ idTrabajador, limite });
  }

  // GET /api/nomina/pagos  (admin) -> [{ idTrabajador, pagoDia }]
  async pagos() {
    const mapa = await this.model.pagos();
    return [...mapa.entries()].map(([idTrabajador, pagoDia]) => ({ idTrabajador, pagoDia }));
  }

  // PUT /api/nomina/:idTrabajador/pago   { pagoDia }  (admin)
  async setPago(idTrabajador, body) {
    const t = await this.usuarioModel.findById(parseId(idTrabajador, "idTrabajador"));
    if (!t || t.rol !== ROLES.TRABAJADOR) throw new AppError("Trabajador no encontrado", 404);
    const pagoDia = redondear(requireNumber(body?.pagoDia, "pagoDia", { min: 0, max: 100000 }));
    await this.model.setPago(t.id, pagoDia);
    return { idTrabajador: t.id, pagoDia };
  }
}
