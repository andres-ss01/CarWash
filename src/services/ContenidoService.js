// =============================================================================
// src/services/ContenidoService.js - Textos editables de la app ("Sobre nosotros")
// -----------------------------------------------------------------------------
// GET es público (lo ven los clientes); PUT solo el administrador.
// Si aún no se ha editado, se devuelve el texto de la web de JAVN Car Wash.
// =============================================================================

import { database } from "../config/Database.js";
import AppError from "../utils/AppError.js";
import { requireString, optionalString } from "../utils/validators.js";

export const SOBRE_NOSOTROS_INICIAL = Object.freeze({
  introduccion:
    "En JAVN Car Wash nos especializamos en brindar servicios de limpieza y cuidado automotriz con calidad, " +
    "confianza y atención personalizada. Nuestro objetivo es mantener tu vehículo en las mejores condiciones " +
    "utilizando productos adecuados y procesos eficientes.",
  mision:
    "Ofrecer un servicio de lavado profesional que garantice la satisfacción de nuestros clientes mediante " +
    "atención rápida y resultados de calidad.",
  vision: "Ser un autolavado reconocido por la innovación, confianza y excelencia en el cuidado de vehículos.",
  valores: [
    { titulo: "Calidad", texto: "cuidamos cada detalle del vehículo." },
    { titulo: "Confianza", texto: "brindamos seguridad durante todo el proceso." },
    { titulo: "Compromiso", texto: "buscamos la satisfacción del cliente." },
  ],
});

const CLAVE = "sobre_nosotros";
const leerJson = (v) => (typeof v === "string" ? JSON.parse(v) : v);

export default class ContenidoService {
  // GET /api/contenido/sobre-nosotros
  async getSobreNosotros() {
    try {
      const rows = await database.query("SELECT valor, actualizado FROM Contenido WHERE clave = ?", [CLAVE]);
      if (rows.length) return { ...leerJson(rows[0].valor), actualizado: rows[0].actualizado };
    } catch (err) {
      console.error("Contenido: no se pudo leer (¿falta la migración 005?):", err.message);
    }
    return { ...SOBRE_NOSOTROS_INICIAL, actualizado: null };
  }

  // PUT /api/contenido/sobre-nosotros   { introduccion, mision, vision, valores: [{ titulo, texto }] }
  async setSobreNosotros(body) {
    if (body?.valores !== undefined && !Array.isArray(body.valores)) {
      throw new AppError("valores debe ser una lista", 400);
    }
    const valores = (body?.valores ?? []).slice(0, 10).map((v, i) => ({
      titulo: requireString(v?.titulo, `valores[${i}].titulo`, { max: 40 }),
      texto: requireString(v?.texto, `valores[${i}].texto`, { max: 200 }),
    }));
    const valor = {
      introduccion: requireString(body?.introduccion, "introduccion", { max: 1000 }),
      mision: optionalString(body?.mision, "mision", { max: 500 }) ?? "",
      vision: optionalString(body?.vision, "vision", { max: 500 }) ?? "",
      valores,
    };
    await database.query(
      `INSERT INTO Contenido (clave, valor) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE valor = VALUES(valor)`,
      [CLAVE, JSON.stringify(valor)]);
    return this.getSobreNosotros();
  }
}
