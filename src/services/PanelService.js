// =============================================================================
// src/services/PanelService.js - Resumen del día para la portada del administrador
// -----------------------------------------------------------------------------
// Todo es "mejor esfuerzo": si el clima o la predicción fallan, el resto del panel se muestra igual.
// =============================================================================

import { database } from "../config/Database.js";
import Cronograma from "../models/Cronograma.js";
import Sugerencia from "../models/Sugerencia.js";
import ClimaService from "./ClimaService.js";
import SugerenciaService from "./SugerenciaService.js";
import { normalizarFecha } from "./CronogramaService.js";
import { turnosQueCubre, TURNOS } from "../utils/planificador.js";
import { parseFechaHora, diaSemana, hoyLocal } from "../utils/fechas.js";

export default class PanelService {
  constructor() {
    this.cronogramaModel = new Cronograma();
    this.sugerenciaModel = new Sugerencia();
    this.climaService = new ClimaService();
    this.sugerenciaService = new SugerenciaService();
  }

  // GET /api/panel/hoy
  async hoy() {
    const fecha = hoyLocal();
    const dia = diaSemana(parseFechaHora(fecha));

    const cifras = async () => {
      const [citas, completadas, abiertas, cobrado] = await Promise.all([
        database.query(
          "SELECT COUNT(*) AS n FROM Cita WHERE DATE(fecha_hora_inicio) = ? AND estado NOT IN ('cancelada','no_asistio')", [fecha]),
        database.query(
          "SELECT COUNT(*) AS n FROM Orden WHERE DATE(fecha_termino) = ?", [fecha]),
        database.query("SELECT COUNT(*) AS n FROM Orden WHERE fecha_termino IS NULL"),
        database.query(
          "SELECT COALESCE(SUM(monto), 0) AS total FROM Pago WHERE estado = 'pagado' AND DATE(fecha_pago) = ?", [fecha]),
      ]);
      return {
        citas: citas[0].n,
        lavadosCompletados: completadas[0].n,
        ordenesAbiertas: abiertas[0].n,
        cobrado: Number(cobrado[0].total),
      };
    };

    const turnos = async () => {
      const pred = await this.sugerenciaService.predecir(fecha);
      if (pred.cerrado) return { cerrado: true, clima: null, turnos: [] };
      const estado = await this.cronogramaModel.estadoDia(fecha, dia);
      const programados = estado.filter((t) => t.trabaja);
      return {
        cerrado: false,
        clima: pred.clima,
        turnos: TURNOS.map((turno) => ({
          turno,
          probLluvia: pred.turnos[turno].probLluvia,
          lavadosEstimados: pred.turnos[turno].lavadosEstimados,
          necesarios: pred.turnos[turno].necesarios,
          metodo: pred.turnos[turno].metodo, // "reglas-v1" o "modelo-v1" (Fase 13)
          programados: programados.filter((t) => turnosQueCubre(t.turno).includes(turno)).length,
        })),
      };
    };

    const [c, t, pendientes] = await Promise.allSettled([
      cifras(), turnos(), this.sugerenciaModel.contarPendientes(fecha),
    ]);
    const ok = (r, vacio) => (r.status === "fulfilled" ? r.value : vacio);
    if (t.status === "rejected") console.error("Panel: predicción no disponible:", t.reason?.message);

    return {
      fecha,
      hoy: ok(c, null),
      cerrado: ok(t, { cerrado: false }).cerrado ?? false,
      clima: ok(t, { clima: null }).clima ?? null,
      turnos: ok(t, { turnos: [] }).turnos ?? [],
      sugerenciasPendientes: ok(pendientes, 0),
    };
  }

  // GET /api/panel/clima?fecha=YYYY-MM-DD
  async clima(query) {
    return this.climaService.obtenerDia(query?.fecha ? normalizarFecha(query.fecha) : hoyLocal());
  }
}
