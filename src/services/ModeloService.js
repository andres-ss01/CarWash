// =============================================================================
// src/services/ModeloService.js - Entrenamiento y uso del modelo de demanda (Fase 13)
// -----------------------------------------------------------------------------
//   entrenar()       arma los datos (citas + clima), entrena, valida contra las reglas y guarda
//   obtenerActivo()  el modelo que se usa al predecir (con caché de 10 min); null = reglas
//   rellenarClima()  trae el clima de fechas pasadas para tener historial de entrenamiento
//   datos()          las muestras de entrenamiento (para revisarlas o exportarlas a CSV)
// =============================================================================

import { config } from "../config/config.js";
import ModeloDemanda from "../models/ModeloDemanda.js";
import Demanda from "../models/Demanda.js";
import Horario from "../models/Horario.js";
import Clima from "../models/Clima.js";
import ClimaService from "./ClimaService.js";
import AppError from "../utils/AppError.js";
import { construirMuestras, entrenarYValidar, explicar, FEATURES } from "../utils/modeloDemanda.js";
import { diaSemana, hoyLocal, parseFechaHora, sumarDias, ahoraLocal } from "../utils/fechas.js";
import { normalizarFecha } from "./CronogramaService.js";

const CACHE_MS = 10 * 60 * 1000;
let cache = { valor: null, hasta: 0 };

export default class ModeloService {
  constructor() {
    this.model = new ModeloDemanda();
    this.demandaModel = new Demanda();
    this.horarioModel = new Horario();
    this.climaModel = new Clima();
    this.climaService = new ClimaService();
  }

  // Turno al que pertenece una hora, según las ventanas de config (null = fuera de turno)
  static turnoDeHora(hora, ventanas = config.ventanasTurno) {
    for (const [turno, [ini, fin]] of Object.entries(ventanas)) if (hora >= ini && hora < fin) return turno;
    return null;
  }

  // Muestras de entrenamiento: una por (fecha pasada en que se abrió, turno)
  async datos() {
    const primera = await this.demandaModel.primeraCita();
    const hoy = hoyLocal();
    if (!primera || primera >= hoy) return { muestras: [], desde: primera, hasta: null };
    const ayer = sumarDias(hoy, -1);

    const [filas, horarios, clima] = await Promise.all([
      this.demandaModel.conteosPorHora({ desde: primera, hasta: hoy, horaCorte: config.horaCorte }),
      this.horarioModel.findAll(),
      this.climaModel.paraEntrenar(primera, ayer),
    ]);

    const conteos = new Map();
    for (const f of filas) {
      const turno = ModeloService.turnoDeHora(Number(f.hora));
      if (!turno) continue;
      const clave = `${String(f.fecha).slice(0, 10)}|${turno}`;
      const c = conteos.get(clave) || { total: 0, agendadas: 0 };
      c.total += Number(f.total) || 0;
      c.agendadas += Number(f.agendadas) || 0;
      conteos.set(clave, c);
    }

    const abre = new Set(horarios.map((h) => h.dia));
    const fechas = [];
    for (let f = primera; f <= ayer; f = sumarDias(f, 1)) {
      if (abre.has(diaSemana(parseFechaHora(f)))) fechas.push(f);
    }

    const muestras = construirMuestras({ conteos, fechas, clima, semanas: config.semanasHistorial });
    const conClima = new Set([...clima.keys()]);
    return {
      muestras,
      desde: primera,
      hasta: ayer,
      diasConClima: fechas.filter((f) => conClima.has(f)).length,
      diasAbiertos: fechas.length,
    };
  }

  // POST /api/modelo/entrenar
  async entrenar() {
    const d = await this.datos();
    const r = entrenarYValidar(d.muestras, { lambda: config.lambdaModelo, minMuestras: config.minMuestrasModelo });
    const cobertura = { diasAbiertos: d.diasAbiertos ?? 0, diasConClima: d.diasConClima ?? 0 };
    if (!r.modelo) return { ...r, ...cobertura, guardado: false };

    const id = await this.model.guardar(r);
    cache = { valor: null, hasta: 0 }; // la próxima predicción lee el modelo nuevo
    const { modelo, ...resumen } = r;
    return { id, ...resumen, ...cobertura, guardado: true, efectos: explicar(modelo) };
  }

  // Modelo activo para predecir; null = usar reglas (sin modelo, apagado o la tabla aún no existe)
  async obtenerActivo() {
    if (!config.usarModelo) return null;
    if (Date.now() < cache.hasta) return cache.valor;
    let valor = null;
    try {
      const fila = await this.model.activo();
      valor = fila ? { ...fila.parametros, id: fila.id } : null;
    } catch (err) {
      console.error("Modelo: no se pudo leer (¿falta la migración 004?). Se usan las reglas:", err.message);
    }
    cache = { valor, hasta: Date.now() + CACHE_MS };
    return valor;
  }

  // GET /api/modelo
  async estado() {
    const [activo, historial] = await Promise.all([this.model.activo(), this.model.historial()]);
    return {
      usando: config.usarModelo && activo ? "modelo" : "reglas",
      apagadoPorConfig: !config.usarModelo,
      activo: activo
        ? { ...activo, parametros: undefined, features: FEATURES, efectos: explicar(activo.parametros) }
        : null,
      historial,
      config: {
        minMuestras: config.minMuestrasModelo,
        lambda: config.lambdaModelo,
        diasReentrenar: config.diasReentrenar,
      },
    };
  }

  // POST /api/modelo/desactivar: vuelve a las reglas (el modelo queda guardado en el historial)
  async desactivar() {
    await this.model.desactivar();
    cache = { valor: null, hasta: 0 };
    return { message: "Modelo desactivado: se usan las reglas" };
  }

  // ¿Toca reentrenar? (no hay modelo o el último tiene más de `diasReentrenar` días)
  async necesitaReentrenar() {
    const ultimo = await this.model.ultimo();
    if (!ultimo) return true;
    const dias = (ahoraLocal() - parseFechaHora(String(ultimo.entrenado).slice(0, 16))) / 86400000;
    return dias >= config.diasReentrenar;
  }

  // POST /api/modelo/clima-historico  { desde?, hasta? }  (por omisión, desde la primera cita hasta ayer)
  async rellenarClima(body) {
    const primera = await this.demandaModel.primeraCita();
    const desde = body?.desde ? normalizarFecha(body.desde, "desde") : primera;
    if (!desde) throw new AppError("Aún no hay citas: no hay historial que completar", 400);
    const hasta = body?.hasta ? normalizarFecha(body.hasta, "hasta") : sumarDias(hoyLocal(), -1);
    return this.climaService.rellenarHistorico(desde, hasta);
  }

  // GET /api/modelo/datos?formato=csv  — para analizar los datos fuera (Excel, Python...)
  async exportar(query) {
    const { muestras } = await this.datos();
    const filas = muestras.map((m) => ({
      fecha: m.fecha,
      turno: m.turno,
      lavados: m.y,
      ...Object.fromEntries(FEATURES.map((f, j) => [f, m.cruda[j]])),
    }));
    if (String(query?.formato || "").toLowerCase() !== "csv") return { tipo: "json", filas };
    const columnas = ["fecha", "turno", "lavados", ...FEATURES];
    const lineas = [columnas.join(","), ...filas.map((f) => columnas.map((c) => f[c] ?? "").join(","))];
    return { tipo: "csv", texto: lineas.join("\n") };
  }
}
