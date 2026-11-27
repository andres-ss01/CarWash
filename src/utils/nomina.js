// =============================================================================
// src/utils/nomina.js - Cálculo del pago semanal de un trabajador (puro, sin base de datos)
// -----------------------------------------------------------------------------
// Por cada día de la semana (estados de /api/cronograma):
//   trabaja, trabaja_extra  -> pago completo (factor 1)
//   descansa_clima          -> medio pago (0.5): aceptó la sugerencia del sistema de descansar
//   descansa, descansa_puntual, ausente, día cerrado -> sin pago
// =============================================================================

import { redondear } from "./validators.js";

export const FACTORES = Object.freeze({
  trabaja: 1,
  trabaja_extra: 1,
  descansa_clima: 0.5,
  descansa: 0,
  descansa_puntual: 0,
  ausente: 0,
});

/**
 * dias:     [{ fecha, estado }] de lunes a domingo
 * cerrados: Set de fechas en que el negocio no abre
 * pagoDia:  pago por día completo
 * hoy:      "YYYY-MM-DD"; los días posteriores son una proyección (aún no se ganan)
 */
export function calcularSemana({ dias, cerrados = new Set(), pagoDia, hoy }) {
  const pago = Number(pagoDia) || 0;
  let diasCompletos = 0;
  let diasMedios = 0;
  let total = 0;
  let totalHastaHoy = 0;

  const detalle = dias.map(({ fecha, estado }) => {
    const factor = cerrados.has(fecha) ? 0 : FACTORES[estado] ?? 0;
    const monto = redondear(pago * factor);
    if (factor === 1) diasCompletos++;
    if (factor === 0.5) diasMedios++;
    total += monto;
    const futuro = fecha > hoy;
    if (!futuro) totalHastaHoy += monto;
    return { fecha, estado: cerrados.has(fecha) ? "cerrado" : estado, factor, monto, futuro };
  });

  return {
    pagoDia: pago,
    diasCompletos,
    diasMedios,
    total: redondear(total),
    totalHastaHoy: redondear(totalHastaHoy),
    detalle,
  };
}
