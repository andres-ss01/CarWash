// =============================================================================
// src/middlewares/errorHandler.js - Manejo centralizado de errores
// =============================================================================

import AppError from "../utils/AppError.js";

// Mensajes claros para violaciones de UNIQUE (según el nombre del índice)
const DUPLICADOS = {
  uq_usuario_correo: "Ya existe un usuario con ese correo",
  uq_admin_rfc: "Ya existe un administrador con ese RFC",
  uq_admin_curp: "Ya existe un administrador con esa CURP",
  uq_trab_rfc: "Ya existe un trabajador con ese RFC",
  uq_trab_curp: "Ya existe un trabajador con esa CURP",
  uq_vehiculo_matricula: "Ya existe un vehículo con esa matrícula",
  uq_tipovehiculo_nombre: "Ya existe un tipo de vehículo con ese nombre",
  uq_servicio_nombre: "Ya existe un servicio con ese nombre",
  uq_orden_cita: "Esa cita ya tiene una orden",
};

export const notFound = (req, res, next) => {
  next(new AppError(`Ruta no encontrada: ${req.method} ${req.originalUrl}`, 404));
};

export const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Error interno del servidor";

  switch (err.code) {
    case "ER_DUP_ENTRY": {
      statusCode = 409;
      const key = Object.keys(DUPLICADOS).find((k) => err.sqlMessage?.includes(k));
      message = key ? DUPLICADOS[key] : "Ya existe un registro con esos datos";
      break;
    }
    case "ER_ROW_IS_REFERENCED_2": // borrar algo que otras tablas usan (FK RESTRICT)
      statusCode = 409;
      message = "No se puede eliminar: el registro está en uso por otros datos";
      break;
    case "ER_NO_REFERENCED_ROW_2": // FK a algo que no existe
      statusCode = 400;
      message = "Referencia inválida: el registro relacionado no existe";
      break;
    case "ER_CHECK_CONSTRAINT_VIOLATED":
      statusCode = 400;
      message = "Los datos no cumplen las reglas de la base de datos";
      break;
    case "ER_DATA_TOO_LONG":
      statusCode = 400;
      message = "Uno de los campos excede la longitud permitida";
      break;
    default:
  }

  // Errores de JWT
  if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "La sesión expiró, inicia sesión de nuevo";
  } else if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Token inválido";
  }

  if (err.type === "entity.parse.failed") {
    statusCode = 400;
    message = "El cuerpo de la petición no es un JSON válido";
  }

  if (statusCode === 500) {
    console.error("💥", err);
    message = "Error interno del servidor";
  }

  res.status(statusCode).json({ status: "error", message });
};
