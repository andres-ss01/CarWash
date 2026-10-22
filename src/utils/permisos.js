// =============================================================================
// src/utils/permisos.js - Roles y comprobaciones de propiedad
// -----------------------------------------------------------------------------
// "actor" es el usuario autenticado: { id, rol }. Lo arma el middleware de auth.
// =============================================================================

import AppError from "./AppError.js";

export const ROLES = Object.freeze({
  CLIENTE: "cliente",
  ADMIN: "administrador",
  TRABAJADOR: "trabajador",
});

export const esAdmin = (actor) => actor?.rol === ROLES.ADMIN;
export const esStaff = (actor) => actor?.rol === ROLES.ADMIN || actor?.rol === ROLES.TRABAJADOR;

// El staff ve todo; un cliente solo lo que le pertenece.
export function exigirDuenoOStaff(actor, idDueno, mensaje = "No tienes permiso para acceder a este recurso") {
  if (!esStaff(actor) && actor?.id !== idDueno) throw new AppError(mensaje, 403);
}
