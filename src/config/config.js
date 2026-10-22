// =============================================================================
// src/config/config.js - Parámetros de la aplicación leídos del .env
// -----------------------------------------------------------------------------
// Son getters para leer process.env en el momento de usarse (ya con dotenv cargado).
// =============================================================================

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
};
