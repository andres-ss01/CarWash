// =============================================================================
// src/utils/validators.js - Funciones de validación y utilidades
// =============================================================================

import AppError from "./AppError.js";

// Convierte el ID de la URL en entero positivo; si no lo es -> 400
export function parseId(value, name = "ID") {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(`${name} inválido: ${value}`, 400);
  }
  return id;
}

function getPath(obj, path) {
  return path.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

// Verifica que existan (y no estén vacíos) todos los campos requeridos
export function requireFields(data, paths) {
  const missing = paths.filter((p) => {
    const value = getPath(data, p);
    return value === undefined || value === null || value === "";
  });
  if (missing.length) {
    throw new AppError(`Campos obligatorios faltantes: ${missing.join(", ")}`, 400);
  }
}

export function requireNumber(value, name, { min, max } = {}) {
  const n = Number(value);
  if (value === "" || value === null || value === undefined || Number.isNaN(n)) {
    throw new AppError(`El campo ${name} debe ser un número`, 400);
  }
  if (min !== undefined && n < min) throw new AppError(`El campo ${name} debe ser >= ${min}`, 400);
  if (max !== undefined && n > max) throw new AppError(`El campo ${name} debe ser <= ${max}`, 400);
  return n;
}

export function requireInt(value, name, { min, max } = {}) {
  const n = requireNumber(value, name, { min, max });
  if (!Number.isInteger(n)) throw new AppError(`El campo ${name} debe ser un entero`, 400);
  return n;
}

export function requireString(value, name, { min = 1, max = 255 } = {}) {
  if (typeof value !== "string") throw new AppError(`El campo ${name} debe ser texto`, 400);
  const v = value.trim();
  if (v.length < min || v.length > max) {
    throw new AppError(`El campo ${name} debe tener entre ${min} y ${max} caracteres`, 400);
  }
  return v;
}

// Texto opcional: vacío/undefined -> null
export function optionalString(value, name, { max = 255 } = {}) {
  if (value === undefined || value === null || value === "") return null;
  return requireString(value, name, { max });
}

export function requireEnum(value, name, allowed) {
  if (!allowed.includes(value)) {
    throw new AppError(`El campo ${name} debe ser uno de: ${allowed.join(", ")}`, 400);
  }
  return value;
}

export function requireEmail(value) {
  const v = requireString(value, "correo", { max: 100 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new AppError("El correo no tiene un formato válido", 400);
  return v;
}

export function requirePassword(value) {
  if (typeof value !== "string" || value.length < 8 || value.length > 72) {
    // 72 = límite real de bcrypt
    throw new AppError("La contraseña debe tener entre 8 y 72 caracteres", 400);
  }
  return value;
}

// Redondea a 2 decimales (dinero)
export const redondear = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Interpreta ?limit y ?sort de la URL
export function parseListOptions({ limit, sort } = {}) {
  const options = {};
  if (limit !== undefined) {
    const n = Number(limit);
    if (!Number.isInteger(n) || n <= 0) throw new AppError("limit debe ser un entero positivo", 400);
    options.limit = n;
  }
  options.sort = sort === "desc" ? "desc" : "asc";
  return options;
}

// Mezcla recursivamente "changes" sobre "base" (permite PATCH con objetos anidados).
// Los arreglos se reemplazan completos.
export function deepMerge(base, changes) {
  const result = { ...base };
  for (const [key, value] of Object.entries(changes || {})) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = deepMerge(base?.[key] || {}, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}
