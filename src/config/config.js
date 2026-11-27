// =============================================================================
// src/config/config.js - Parámetros de la aplicación leídos del .env
// -----------------------------------------------------------------------------
// Son getters para leer process.env en el momento de usarse (ya con dotenv cargado).
// =============================================================================
///
////

export const config = {
  get jwtSecret() {
    return process.env.JWT_SECRET;
  },
  get jwtExpiresIn() {
    return process.env.JWT_EXPIRES_IN || "8h";
  },
  get bcryptRounds() {
    return 10;
  },
  // Máximo de citas que pueden traslaparse en el mismo horario
  get citasSimultaneas() {
    return Number(process.env.CITAS_SIMULTANEAS) || 2;
  },
  // Intervalo (min) de los horarios ofrecidos al consultar disponibilidad
  get slotMin() {
    return Number(process.env.SLOT_MIN) || 30;
  },

  // ---- Fase 11: clima, demanda y sugerencias ----
  // Ubicación del negocio para el pronóstico (Open-Meteo). Por defecto, Ciudad de México.
  get latitud() {
    return Number(process.env.NEGOCIO_LAT) || 19.4326;
  },
  get longitud() {
    return Number(process.env.NEGOCIO_LON) || -99.1332;
  },
  // Ventanas de cada turno en horas locales: [inicio, fin)
  get ventanasTurno() {
    return {
      matutino: [Number(process.env.TURNO_MATUTINO_INICIO) || 8, Number(process.env.TURNO_MATUTINO_FIN) || 14],
      vespertino: [Number(process.env.TURNO_VESPERTINO_INICIO) || 14, Number(process.env.TURNO_VESPERTINO_FIN) || 20],
    };
  },
  // Cuántos lavados atiende un lavador en un turno
  get lavadosPorLavador() {
    return Number(process.env.LAVADOS_POR_LAVADOR) || 5;
  },
  // Mínimo de lavadores por turno (nunca se sugiere descansar por debajo de esto)
  get minLavadoresTurno() {
    return Number(process.env.MIN_LAVADORES_TURNO) || 2;
  },
  // Lavados por turno que se asumen mientras no haya historial suficiente
  get demandaBaseTurno() {
    return Number(process.env.DEMANDA_BASE_TURNO) || 6;
  },
  // Semanas de historial que se promedian para estimar la demanda
  get semanasHistorial() {
    return Number(process.env.SEMANAS_HISTORIAL) || 8;
  },
  // Probabilidad de lluvia (%) desde la cual se sugiere descansar
  get umbralLluvia() {
    return Number(process.env.UMBRAL_LLUVIA) || 60;
  },
  // "activo" genera sugerencias; "sombra" solo guarda predicciones (para validarlas antes de molestar al personal)
  get modoSugerencias() {
    return String(process.env.SUGERENCIAS_MODO || "activo").toLowerCase() === "sombra" ? "sombra" : "activo";
  },
  // ---- Fase 13: modelo de machine learning ----
  // "off" obliga a usar las reglas aunque haya un modelo activo
  get usarModelo() {
    return String(process.env.MODELO_ML || "on").toLowerCase() !== "off";
  },
  // Turnos (fecha + turno) mínimos para activar el modelo (112 ≈ 8 semanas x 7 días x 2 turnos)
  get minMuestrasModelo() {
    return Number(process.env.MODELO_MIN_MUESTRAS) || 112;
  },
  // Regularización L2: más alta = modelo más conservador
  get lambdaModelo() {
    return Number(process.env.MODELO_LAMBDA) || 2;
  },
  // Días entre reentrenamientos automáticos (los hace el cron diario)
  get diasReentrenar() {
    return Number(process.env.MODELO_DIAS_REENTRENAR) || 7;
  },
  // Hora de la víspera en que se "congela" lo agendado (coincide con el cron de las 18:00)
  get horaCorte() {
    return Number(process.env.MODELO_HORA_CORTE) || 18;
  },

  // Secreto del cron de Vercel (Vercel lo envía como "Authorization: Bearer <CRON_SECRET>")
  get cronSecret() {
    return process.env.CRON_SECRET;
  },
};
