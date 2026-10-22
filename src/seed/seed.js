// =============================================================================
// src/seed/seed.js - Crea las tablas y las puebla con datos de demostración
// -----------------------------------------------------------------------------
// Ejecutar con:  npm run seed
// 1) Ejecuta database/schema.sql (BORRA y recrea las tablas + catálogos).
// 2) Crea usuarios, vehículos y citas usando los mismos servicios que la API
//    (así se aplican las mismas validaciones y el hash de contraseñas).
// 3) Recibe la primera cita, la avanza un paso, asigna un trabajador y registra un anticipo.
// Se puede ejecutar varias veces sin generar duplicados.
// =============================================================================

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { database } from "../config/Database.js";
import UsuarioService from "../services/UsuarioService.js";
import VehiculoService from "../services/VehiculoService.js";
import CitaService from "../services/CitaService.js";
import OrdenService from "../services/OrdenService.js";
import PagoService from "../services/PagoService.js";
import { administrador, trabajadores, clientes, vehiculos, citas } from "./data.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(__dirname, "../../database/schema.sql");

// 'YYYY-MM-DD' del n-ésimo día hábil (lun-vie) a partir de mañana
function diaHabil(n) {
  const d = new Date();
  let contados = 0;
  while (contados < n) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) contados++;
  }
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function runSeed() {
  try {
    await database.connect();

    await database.runScript(fs.readFileSync(schemaPath, "utf8"));
    console.log("🧱 Tablas y catálogos creados");

    const usuarioService = new UsuarioService();
    const vehiculoService = new VehiculoService();
    const citaService = new CitaService();
    const ordenService = new OrdenService();
    const pagoService = new PagoService();

    const admin = await usuarioService.crear(administrador);
    const actor = { id: admin.id, rol: "administrador" };

    const trabajadoresDB = [];
    for (const t of trabajadores) trabajadoresDB.push(await usuarioService.crear(t));
    const clientesDB = [];
    for (const c of clientes) clientesDB.push(await usuarioService.crear(c));
    console.log(`👤 ${1 + trabajadoresDB.length + clientesDB.length} usuarios creados`);

    const vehiculosDB = [];
    for (const { cliente, ...v } of vehiculos) {
      vehiculosDB.push(await vehiculoService.create(actor, { ...v, idCliente: clientesDB[cliente].id }));
    }
    console.log(`🚗 ${vehiculosDB.length} vehículos creados`);

    const citasDB = [];
    for (const c of citas) {
      citasDB.push(await citaService.crear(actor, {
        idVehiculo: vehiculosDB[c.vehiculo].id,
        fechaHoraInicio: `${diaHabil(c.diasHabiles)} ${c.hora}`,
        servicios: c.servicios,
        notas: c.notas,
      }));
    }
    console.log(`📅 ${citasDB.length} citas creadas`);

    // Flujo completo de ejemplo con la primera cita
    const orden = await ordenService.crear(actor, { idCita: citasDB[0].id });
    await ordenService.avanzar(actor, orden.id);
    await ordenService.asignarTrabajador(orden.id, { idTrabajador: trabajadoresDB[0].id });
    await pagoService.crear(actor, { idOrden: orden.id, monto: 40, metodo: "efectivo" });
    console.log(`🧽 Orden #${orden.id} creada (en proceso, con trabajador y un anticipo de $40)`);

    console.log("\n✅ Seed completado con éxito. Credenciales de prueba:");
    console.log(`   Administrador: ${administrador.correo} / ${administrador.contrasena}`);
    console.log(`   Trabajador:    ${trabajadores[0].correo} / ${trabajadores[0].contrasena}`);
    console.log(`   Cliente:       ${clientes[0].correo} / ${clientes[0].contrasena}`);
  } catch (error) {
    console.error("❌ Error ejecutando el seed:", error.message);
    process.exitCode = 1;
  } finally {
    await database.disconnect();
  }
}

runSeed();
