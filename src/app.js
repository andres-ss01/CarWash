// =============================================================================
// src/app.js - Aplicación Express (sin app.listen)
// -----------------------------------------------------------------------------
// Se separa del arranque para poder usarla de dos formas:
//   - Local / Render / Railway: server.js la monta con app.listen()
//   - Vercel (serverless):      api/index.js la exporta como función
// La conexión a MySQL es "perezosa": se abre en la primera petición y se reutiliza.
// =============================================================================

import "dotenv/config";
import express from "express";
import cors from "cors";

import { database } from "./config/Database.js";
import apiRoutes from "./routes/index.js";
import { notFound, errorHandler } from "./middlewares/errorHandler.js";

export function validarConfig() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    throw new Error("Define JWT_SECRET (mínimo 16 caracteres) en tu .env o en las variables de entorno");
  }
}

// Conecta a MySQL una sola vez por instancia (si falla, se reintenta en la siguiente petición)
let dbReady = null;
export function ensureDatabase() {
  if (!dbReady) {
    dbReady = database.connect().catch((err) => {
      dbReady = null;
      throw err;
    });
  }
  return dbReady;
}

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check (no toca la base de datos)
  app.get("/", (req, res) => {
    res.json({
      message: "API Car Wash (MySQL) funcionando correctamente",
      endpoints: {
        auth: "/api/auth",
        usuarios: "/api/usuarios",
        tiposVehiculo: "/api/tipos-vehiculo",
        vehiculos: "/api/vehiculos",
        servicios: "/api/servicios",
        horarios: "/api/horarios",
        citas: "/api/citas",
        ordenes: "/api/ordenes",
        pagos: "/api/pagos",
        notificaciones: "/api/notificaciones",
        cronograma: "/api/cronograma",
        sugerencias: "/api/sugerencias",
        panel: "/api/panel",
        modelo: "/api/modelo",
      },
    });
  });

  // Antes de cualquier /api: valida config y asegura la conexión a MySQL
  app.use("/api", async (req, res, next) => {
    try {
      validarConfig();
      await ensureDatabase();
      next();
    } catch (err) {
      console.error("❌ Error de configuración/conexión:", err.message);
      res.status(500).json({ status: "error", message: "Error interno del servidor" });
    }
  });
  app.use("/api", apiRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

export default createApp();
