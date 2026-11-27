// =============================================================================
// src/services/SugerenciaService.js - Predicción de demanda y sugerencias al personal
// -----------------------------------------------------------------------------
// Flujo diario (cron):
//   1. Clima de la fecha (pronóstico por turno).
//   2. Lavados esperados por turno  = promedio histórico del mismo día x factor de lluvia
//      (reglas-v1; es el punto donde luego entra el modelo de machine learning).
//   3. Lavadores necesarios por turno = lavados / capacidad, con un mínimo.
//   4. Si sobra personal y llueve -> se sugiere DESCANSAR (reparto justo); si falta -> TRABAJAR (voluntario).
//   5. El trabajador acepta o rechaza; al aceptar se crea la excepción de ese día.
// =============================================================================

import { database } from "../config/Database.js";
import { config } from "../config/config.js";
import Sugerencia from "../models/Sugerencia.js";
import Cronograma from "../models/Cronograma.js";
import Demanda from "../models/Demanda.js";
import Horario from "../models/Horario.js";
import Usuario from "../models/Usuario.js";
import Notificacion from "../models/Notificacion.js";
import ClimaService from "./ClimaService.js";
import AppError from "../utils/AppError.js";
import { ROLES, esAdmin } from "../utils/permisos.js";
import { parseId, requireEnum } from "../utils/validators.js";
import { normalizarFecha } from "./CronogramaService.js";
import {
  parseFechaHora, diaSemana, hoyLocal, sumarDias, fechaLegible, ahoraLocal, formatFechaHora,
} from "../utils/fechas.js";
import ModeloService from "./ModeloService.js";
import {
  TURNOS, turnosQueCubre, estimarLavados, lavadoresNecesarios, elegirDescansos, elegirRefuerzos,
} from "../utils/planificador.js";

const ESTADOS = ["pendiente", "aceptada", "rechazada", "expirada"];

export default class SugerenciaService {
  constructor() {
    this.model = new Sugerencia();
    this.cronogramaModel = new Cronograma();
    this.demandaModel = new Demanda();
    this.horarioModel = new Horario();
    this.usuarioModel = new Usuario();
    this.notificacionModel = new Notificacion();
    this.climaService = new ClimaService();
    this.modeloService = new ModeloService();
  }

  async avisarAdmins(mensaje, conn = null) {
    const admins = await this.usuarioModel.findAll({ rol: ROLES.ADMIN, activo: true });
    for (const a of admins) await this.notificacionModel.create(a.id, null, mensaje, conn);
  }

  // Lavados históricos de ese día de la semana y turno, promediados sobre las semanas observadas
  async historico(dia, turno, hoy, primeraCita) {
    if (!primeraCita) return { historico: 0, semanas: 0 };
    const ideal = sumarDias(hoy, -7 * config.semanasHistorial);
    const desde = primeraCita > ideal ? primeraCita : ideal;

    let semanas = 0;
    for (let f = desde; f < hoy; f = sumarDias(f, 1)) {
      if (diaSemana(parseFechaHora(f)) === dia) semanas++;
    }
    const [horaInicio, horaFin] = config.ventanasTurno[turno];
    const historico = semanas
      ? await this.demandaModel.lavadosEntre({ desde, hasta: hoy, dia, horaInicio, horaFin })
      : 0;
    return { historico, semanas };
  }

  // Calcula y guarda la predicción de una fecha (no crea sugerencias).
  async predecir(fechaParam) {
    const fecha = normalizarFecha(fechaParam);
    const dia = diaSemana(parseFechaHora(fecha));
    const horario = await this.horarioModel.findByDia(dia);
    if (!horario) return { fecha, dia, cerrado: true, turnos: {} };

    const clima = await this.climaService.obtenerDia(fecha);
    const hoy = hoyLocal();
    const primeraCita = await this.demandaModel.primeraCita();
    const modelo = await this.modeloService.obtenerActivo(); // Fase 13; null = reglas

    // Lo agendado se mide como lo vería el cron: la víspera a las 18:00 (o ahora, si aún no llega esa hora)
    const corteVispera = `${sumarDias(fecha, -1)} ${String(config.horaCorte).padStart(2, "0")}:00:00`;
    const ahora = formatFechaHora(ahoraLocal());
    const corte = ahora < corteVispera ? ahora : corteVispera;

    const turnos = {};
    for (const turno of TURNOS) {
      const probLluvia = clima.turnos[turno].probLluvia ?? clima.probLluvia;
      const { historico, semanas } = await this.historico(dia, turno, hoy, primeraCita);
      let contexto = null;
      if (modelo) {
        const [horaInicio, horaFin] = config.ventanasTurno[turno];
        const agendadas = await this.demandaModel.agendadasAntes({ fecha, horaInicio, horaFin, corte });
        contexto = { fecha, turno, precipitacionMm: clima.precipitacionMm, tempMax: clima.tempMax, agendadas };
      }
      const est = estimarLavados({
        historico, semanas, demandaBase: config.demandaBaseTurno, probLluvia, modelo, contexto,
      });
      const necesarios = lavadoresNecesarios(est.estimado, config.lavadosPorLavador, config.minLavadoresTurno);
      await this.demandaModel.upsertPrediccion({ fecha, turno, lavados: est.estimado, necesarios, metodo: est.metodo });
      turnos[turno] = { probLluvia, lavadosEstimados: est.estimado, necesarios, base: est.base, factor: est.factor, metodo: est.metodo, conHistorial: est.conHistorial };
    }
    return { fecha, dia, cerrado: false, clima, turnos };
  }

  // Predice y, si el modo es "activo", crea las sugerencias y avisa al personal. Se puede repetir sin duplicar.
  async generar(fechaParam) {
    const pred = await this.predecir(fechaParam);
    const modo = config.modoSugerencias;
    if (pred.cerrado) return { ...pred, modo, creadas: 0, sugerencias: [], aviso: "El negocio no abre ese día" };
    if (modo === "sombra") return { ...pred, modo, creadas: 0, sugerencias: [], aviso: "Modo sombra: solo se guardó la predicción" };

    const { fecha, dia, turnos } = pred;
    this.exigirNoPasada(fecha);
    const estado = await this.cronogramaModel.estadoDia(fecha, dia);
    const yaSugeridos = new Set((await this.model.findAll({ fecha })).map((s) => s.trabajador.id));

    const programados = estado.filter((t) => t.trabaja);
    const libres = estado.filter((t) => !t.plantilla && !t.excepcion && !yaSugeridos.has(t.id));
    const elegibles = new Set(programados.filter((t) => !t.excepcion && !yaSugeridos.has(t.id)).map((t) => t.id));

    const necesarios = Object.fromEntries(TURNOS.map((s) => [s, turnos[s].necesarios]));
    const prob = Object.fromEntries(TURNOS.map((s) => [s, turnos[s].probLluvia]));
    const hoy = hoyLocal();
    const hace30 = sumarDias(hoy, -30);
    const [descansosRecientes, extrasRecientes] = await Promise.all([
      this.cronogramaModel.contarPorSugerencia("descansa", hace30, hoy),
      this.cronogramaModel.contarPorSugerencia("trabaja", hace30, hoy),
    ]);

    const idsDescanso = elegirDescansos({ programados, necesarios, prob, umbral: config.umbralLluvia, descansosRecientes, elegibles });
    const idsRefuerzo = elegirRefuerzos({ programados, libres, necesarios, extrasRecientes });

    const porId = new Map(estado.map((t) => [t.id, t]));
    const nuevas = [
      ...idsDescanso.map((id) => ({ id, tipo: "descansar" })),
      ...idsRefuerzo.map((id) => ({ id, tipo: "trabajar" })),
    ];

    const creadas = [];
    await database.transaction(async (conn) => {
      for (const { id, tipo } of nuevas) {
        const t = porId.get(id);
        const s = turnos[turnosQueCubre(t.turno)[0]];
        const motivo = tipo === "descansar"
          ? `Se espera lluvia (${s.probLluvia}%) y poca demanda (~${s.lavadosEstimados} lavados por turno; bastan ${s.necesarios} lavadores).`
          : `Se espera mucha demanda (~${s.lavadosEstimados} lavados en tu turno) y faltan lavadores. Es voluntario.`;
        const idSugerencia = await this.model.create({ idTrabajador: id, fecha, tipo, motivo }, conn);
        if (!idSugerencia) continue; // ya existía
        creadas.push({ id: idSugerencia, idTrabajador: id, tipo });
        await this.notificacionModel.create(
          id, null,
          `Sugerencia para el ${fechaLegible(fecha)}: ${tipo === "descansar" ? "descansar" : "trabajar (voluntario)"}. ${motivo} Respóndela en la app.`,
          conn);
      }
      if (creadas.length) {
        const d = creadas.filter((c) => c.tipo === "descansar").length;
        await this.avisarAdmins(
          `Se generaron ${creadas.length} sugerencias para el ${fechaLegible(fecha)}: ${d} de descanso y ${creadas.length - d} de refuerzo.`, conn);
      }
    });

    return { ...pred, modo, creadas: creadas.length, sugerencias: await this.model.findAll({ fecha }) };
  }

  // Fecha de mañana (hora del negocio)
  manana() {
    return sumarDias(hoyLocal(), 1);
  }

  exigirNoPasada(fecha) {
    if (fecha < hoyLocal()) throw new AppError("No se puede generar para un día que ya pasó", 400);
  }

  // GET /api/sugerencias/mias?estado=pendiente  (solo desde hoy)
  async getMias(actor, query) {
    if (query?.estado) requireEnum(query.estado, "estado", ESTADOS);
    return this.model.findAll({ idTrabajador: actor.id, estado: query?.estado, desde: hoyLocal() });
  }

  // GET /api/sugerencias?fecha=&estado=   (administrador)
  async getAll(query) {
    if (query?.estado) requireEnum(query.estado, "estado", ESTADOS);
    return this.model.findAll({
      fecha: query?.fecha ? normalizarFecha(query.fecha) : undefined,
      estado: query?.estado,
    });
  }

  // PATCH /api/sugerencias/:id   { estado: "aceptada" | "rechazada" }
  async responder(actor, id, body) {
    const estado = requireEnum(body?.estado, "estado", ["aceptada", "rechazada"]);
    const s = await this.model.findById(parseId(id));
    if (!s) throw new AppError("Sugerencia no encontrada", 404);
    if (!esAdmin(actor) && s.trabajador.id !== actor.id) throw new AppError("Esa sugerencia no es tuya", 403);
    if (s.estado !== "pendiente") throw new AppError(`La sugerencia ya está ${s.estado}`, 409);

    if (s.fecha < hoyLocal()) {
      await this.model.responder(s.id, "expirada");
      throw new AppError("La sugerencia ya expiró", 409);
    }
    if (estado === "rechazada") {
      await this.model.responder(s.id, "rechazada");
      await this.avisarAdmins(
        `${s.trabajador.nombre} rechazó ${s.tipo === "descansar" ? "descansar" : "trabajar"} el ${fechaLegible(s.fecha)}.`);
      return this.model.findById(s.id);
    }

    const dia = diaSemana(parseFechaHora(s.fecha));
    const resultado = await database.transaction(async (conn) => {
      // Un día a la vez: dos trabajadores aceptando a la vez no deben dejar el turno sin personal
      await this.model.bloquearFecha(s.fecha, conn);
      const actual = await this.model.findById(s.id, conn);
      if (actual.estado !== "pendiente") throw new AppError(`La sugerencia ya está ${actual.estado}`, 409);

      if (s.tipo === "descansar") {
        const pred = await this.demandaModel.findPredicciones(s.fecha, conn);
        const estadoDia = await this.cronogramaModel.estadoDia(s.fecha, dia, conn);
        const yo = estadoDia.find((t) => t.id === s.trabajador.id);
        const quedan = estadoDia.filter((t) => t.trabaja && t.id !== s.trabajador.id);
        const sinMinimo = yo && turnosQueCubre(yo.turno).some((turno) => {
          const necesarios = pred[turno]?.necesarios ?? config.minLavadoresTurno;
          const cubren = quedan.filter((t) => turnosQueCubre(t.turno).includes(turno)).length;
          return cubren < necesarios;
        });
        if (sinMinimo) {
          await this.model.responder(s.id, "expirada", conn);
          return { sinMinimo: true };
        }
      }

      await this.cronogramaModel.upsertExcepcion({
        idTrabajador: s.trabajador.id, fecha: s.fecha, origen: "sugerencia", idSugerencia: s.id,
        estado: s.tipo === "descansar" ? "descansa" : "trabaja",
      }, conn);
      await this.model.responder(s.id, "aceptada", conn);
      await this.avisarAdmins(
        `${s.trabajador.nombre} aceptó ${s.tipo === "descansar" ? "descansar" : "trabajar"} el ${fechaLegible(s.fecha)}.`, conn);
      return { sinMinimo: false };
    });

    if (resultado.sinMinimo) {
      throw new AppError("Ya no se puede descansar ese día: el turno quedaría con menos lavadores de los necesarios", 409);
    }
    return this.model.findById(s.id);
  }

  async expirarPasadas() {
    return this.model.expirarAnteriores(hoyLocal());
  }
}
