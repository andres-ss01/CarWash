// =============================================================================
// src/routes/index.js - Agrupa todas las rutas bajo el prefijo /api
// =============================================================================

import { Router } from "express";
import authRoutes from "./authRoutes.js";
import usuarioRoutes from "./usuarioRoutes.js";
import tipoVehiculoRoutes from "./tipoVehiculoRoutes.js";
import vehiculoRoutes from "./vehiculoRoutes.js";
import servicioRoutes from "./servicioRoutes.js";
import horarioRoutes from "./horarioRoutes.js";
import citaRoutes from "./citaRoutes.js";
import ordenRoutes from "./ordenRoutes.js";
import pagoRoutes from "./pagoRoutes.js";
import notificacionRoutes from "./notificacionRoutes.js";
import cronogramaRoutes from "./cronogramaRoutes.js";
import sugerenciaRoutes from "./sugerenciaRoutes.js";
import panelRoutes from "./panelRoutes.js";
import cronRoutes from "./cronRoutes.js";
import modeloRoutes from "./modeloRoutes.js";
import nominaRoutes from "./nominaRoutes.js";
import contenidoRoutes from "./contenidoRoutes.js";

const router = Router();

router.use("/auth", authRoutes);                   // -> /api/auth
router.use("/usuarios", usuarioRoutes);            // -> /api/usuarios
router.use("/tipos-vehiculo", tipoVehiculoRoutes); // -> /api/tipos-vehiculo
router.use("/vehiculos", vehiculoRoutes);          // -> /api/vehiculos
router.use("/servicios", servicioRoutes);          // -> /api/servicios
router.use("/horarios", horarioRoutes);            // -> /api/horarios
router.use("/citas", citaRoutes);                  // -> /api/citas
router.use("/ordenes", ordenRoutes);               // -> /api/ordenes
router.use("/pagos", pagoRoutes);                  // -> /api/pagos
router.use("/notificaciones", notificacionRoutes); // -> /api/notificaciones
router.use("/cronograma", cronogramaRoutes);       // -> /api/cronograma
router.use("/sugerencias", sugerenciaRoutes);      // -> /api/sugerencias
router.use("/panel", panelRoutes);                 // -> /api/panel
router.use("/modelo", modeloRoutes);               // -> /api/modelo (Fase 13, admin)
router.use("/nomina", nominaRoutes);               // -> /api/nomina (pago por día y semanas)
router.use("/contenido", contenidoRoutes);         // -> /api/contenido ("Sobre nosotros")
router.use("/cron", cronRoutes);                   // -> /api/cron (solo con CRON_SECRET)

export default router;
