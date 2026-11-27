// =============================================================================
// scripts/simular_historial.js - Llena una base DE PRUEBAS con historial simulado y entrena el modelo
// -----------------------------------------------------------------------------
// ⚠️ Solo para demostrar el machine learning. NUNCA contra la base real del negocio.
//
// Uso (PowerShell, desde la carpeta del backend):
//   node scripts/simular_historial.js --env .env.pruebas --confirmar carwash_pruebas
//   node scripts/simular_historial.js --env .env.pruebas --confirmar carwash_pruebas --semanas 20 --semilla 7
//   node scripts/simular_historial.js --env .env.pruebas --confirmar carwash_pruebas --borrar
//
// Candados de seguridad:
//   1. Hay que indicar el archivo de entorno (--env); no usa el .env normal por accidente.
//   2. --confirmar debe ser exactamente el DB_NAME de ese archivo.
//   3. Solo corre en bases cuyo nombre contenga "prueba" (p. ej. carwash_pruebas): nunca en producción.
//   4. Si la base tiene más de 20 citas no simuladas (el seed crea 4), se detiene salvo --aun-con-datos-reales.
// Todo lo simulado queda marcado (notas = '[SIMULADA]') y se borra con --borrar.
// =============================================================================

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const ETIQUETA = "[SIMULADA]";
const CORREO_SIM = "simulacion@carwash.test";
const MATRICULA_SIM = "SIM-0001";
const MAX_CITAS_DEMO = 20; // el seed crea 4; más que esto huele a base con datos reales

function leerArgs(argv) {
  const args = { semanas: 16, semilla: 42 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const siguiente = () => argv[++i];
    if (a === "--env") args.env = siguiente();
    else if (a === "--confirmar") args.confirmar = siguiente();
    else if (a === "--semanas") args.semanas = Number(siguiente());
    else if (a === "--semilla") args.semilla = Number(siguiente());
    else if (a === "--borrar") args.borrar = true;
    else if (a === "--sin-entrenar") args.sinEntrenar = true;
    else if (a === "--aun-con-datos-reales") args.conReales = true;
    else throw new Error(`Opción desconocida: ${a}`);
  }
  return args;
}

function salir(mensaje) {
  console.error(`\n⛔ ${mensaje}\n`);
  process.exit(1);
}

async function main() {
  const args = leerArgs(process.argv.slice(2));

  // --- Candados 1 a 3 ---
  if (!args.env) salir("Indica el archivo de entorno de la base de pruebas: --env .env.pruebas");
  const archivoEnv = path.resolve(args.env);
  if (!fs.existsSync(archivoEnv)) salir(`No existe ${archivoEnv}`);
  dotenv.config({ path: archivoEnv, override: true });
  const dbName = process.env.DB_NAME;
  if (!dbName) salir(`${args.env} no define DB_NAME`);
  if (args.confirmar !== dbName) salir(`Para continuar agrega: --confirmar ${dbName}`);
  // Solo bases cuyo nombre diga que son de pruebas: así nunca se toca la de producción,
  // se llame como se llame (en TiDB Cloud suele ser "test" o el nombre que le diste).
  if (!dbName.toLowerCase().includes("prueba")) {
    salir(`"${dbName}" no parece una base de pruebas. Usa una base cuyo nombre contenga "prueba", p. ej. carwash_pruebas.`);
  }
  if (!Number.isFinite(args.semanas) || args.semanas < 4 || args.semanas > 104) salir("--semanas debe estar entre 4 y 104");

  // Se importan después de cargar el .env de pruebas
  const { database } = await import("../src/config/Database.js");
  const { config } = await import("../src/config/config.js");
  const { hoyLocal, sumarDias } = await import("../src/utils/fechas.js");
  const { simularHistorial, EFECTOS_SIMULADOS } = await import("../src/utils/simulacion.js");
  const { default: Clima } = await import("../src/models/Clima.js");
  const bcrypt = (await import("bcryptjs")).default;

  await database.connect();
  console.log(`\nBase: ${dbName} (host ${process.env.DB_HOST})`);

  try {
    // --- Borrar lo simulado ---
    const borrarSimulado = async () => {
      const r = await database.query("DELETE FROM Cita WHERE notas = ?", [ETIQUETA]);
      await database.query("DELETE FROM Usuario WHERE correo = ?", [CORREO_SIM]);
      return r.affectedRows;
    };
    if (args.borrar) {
      const n = await borrarSimulado();
      console.log(`🧹 Se borraron ${n} citas simuladas y el cliente de simulación.`);
      console.log("   (El clima simulado de ClimaDia/ClimaPronostico se queda; se sobrescribe al sincronizar.)");
      return;
    }

    // --- Candado 4: ¿hay citas reales? (se toleran las pocas de demostración que crea el seed) ---
    const [{ reales }] = await database.query(
      "SELECT COUNT(*) AS reales FROM Cita WHERE notas IS NULL OR notas <> ?", [ETIQUETA]);
    if (reales > MAX_CITAS_DEMO && !args.conReales) {
      salir(`La base tiene ${reales} citas que no son simuladas. Si de verdad es de pruebas, agrega --aun-con-datos-reales.`);
    }

    // --- Cliente y vehículo de simulación ---
    let [usuario] = await database.query("SELECT idUsuario FROM Usuario WHERE correo = ?", [CORREO_SIM]);
    if (!usuario) {
      const hash = await bcrypt.hash(`sim-${Date.now()}-${Math.random()}`, 10);
      const res = await database.query(
        `INSERT INTO Usuario (nombre, apellidos, telefono, correo, contrasena_hash, rol, activo)
         VALUES ('Cliente', 'Simulado', '0000000000', ?, ?, 'cliente', 0)`, [CORREO_SIM, hash]);
      await database.query("INSERT INTO Cliente (idUsuario) VALUES (?)", [res.insertId]);
      usuario = { idUsuario: res.insertId };
    }
    const idCliente = usuario.idUsuario;
    let [vehiculo] = await database.query("SELECT idVehiculo FROM Vehiculo WHERE matricula = ?", [MATRICULA_SIM]);
    if (!vehiculo) {
      const [tipo] = await database.query("SELECT idTipoVehiculo FROM TipoVehiculo ORDER BY idTipoVehiculo LIMIT 1");
      if (!tipo) salir("No hay tipos de vehículo. Corre primero el seed en la base de pruebas.");
      const res = await database.query(
        `INSERT INTO Vehiculo (matricula, marca, modelo, color, anio, idTipoVehiculo, idCliente)
         VALUES (?, 'Simulado', 'Demo', 'Gris', 2020, ?, ?)`, [MATRICULA_SIM, tipo.idTipoVehiculo, idCliente]);
      vehiculo = { idVehiculo: res.insertId };
    }

    // --- Horarios del negocio ---
    const filasHorario = await database.query("SELECT dia_semana, hora_apertura, hora_cierre FROM HorarioAtencion");
    if (!filasHorario.length) salir("No hay horarios de atención. Corre primero el seed en la base de pruebas.");
    const aMin = (t) => { const [h, m] = String(t).split(":"); return Number(h) * 60 + Number(m); };
    const horarios = new Map(filasHorario.map((h) => [h.dia_semana, { apertura: aMin(h.hora_apertura), cierre: aMin(h.hora_cierre) }]));

    // --- Generar ---
    const hasta = sumarDias(hoyLocal(), -1);
    const desde = sumarDias(hasta, -(args.semanas * 7) + 1);
    const { citas, clima } = simularHistorial({
      desde, hasta, horarios, ventanas: config.ventanasTurno, semilla: args.semilla,
    });
    console.log(`Generando ${args.semanas} semanas (${desde} a ${hasta}): ${citas.length} citas y ${clima.length} días de clima…`);

    // Reemplaza la simulación anterior (si la hubo)
    await database.query("DELETE FROM Cita WHERE notas = ?", [ETIQUETA]);
    const filas = citas.map((c) => [
      idCliente, vehiculo.idVehiculo, c.inicio, c.fin, c.estado, 0, ETIQUETA, c.creacion,
    ]);
    for (let i = 0; i < filas.length; i += 500) {
      await database.query(
        `INSERT INTO Cita (idCliente, idVehiculo, fecha_hora_inicio, fecha_hora_fin, estado, total_estimado, notas, fecha_creacion)
         VALUES ?`, [filas.slice(i, i + 500)]);
    }

    // Clima: lo "observado" en ClimaDia y el pronóstico de la víspera en ClimaPronostico
    const climaModel = new Clima();
    let conPronostico = true;
    for (const c of clima) {
      await climaModel.upsert({ ...c, observado: true });
      if (conPronostico) {
        try {
          await climaModel.guardarPronostico(c, sumarDias(c.fecha, -1));
        } catch (err) {
          conPronostico = false;
          console.warn("   (Sin tabla ClimaPronostico: corre la migración 003. Se entrenará con ClimaDia.)");
        }
      }
    }
    console.log("✅ Historial simulado guardado.");

    // --- Entrenar ---
    if (args.sinEntrenar) return;
    const { default: ModeloService } = await import("../src/services/ModeloService.js");
    console.log("\nEntrenando el modelo…");
    const r = await new ModeloService().entrenar();
    console.log(`\n  Turnos usados:        ${r.muestras} (entrenamiento ${r.entrenamiento ?? "-"}, prueba ${r.prueba ?? "-"})`);
    console.log(`  Error del modelo:     ${r.maeModelo ?? "-"} lavados por turno`);
    console.log(`  Error de las reglas:  ${r.maeReglas ?? "-"} lavados por turno`);
    if (r.mejora !== undefined) console.log(`  Mejora:               ${Math.round(r.mejora * 100)} %`);
    console.log(`  Activo:               ${r.activo ? "sí" : "no"}`);
    console.log(`  Motivo:               ${r.motivo}`);
    if (r.efectos) {
      console.log("\n  Lo que aprendió el modelo:");
      for (const e of r.efectos) console.log(`    - ${e.texto}`);
    }
    console.log("\n  Lo que se programó en la simulación (debería parecerse):");
    console.log(`    - lluvia: demanda x e^(${EFECTOS_SIMULADOS.lluvia} x probabilidad) → con 100 % de lluvia ≈ ${Math.round((Math.exp(EFECTOS_SIMULADOS.lluvia) - 1) * 100)} %`);
    console.log(`    - quincena: +${Math.round((EFECTOS_SIMULADOS.quincena - 1) * 100)} % · festivo: ${Math.round((EFECTOS_SIMULADOS.festivo - 1) * 100)} % · tarde: +${Math.round((EFECTOS_SIMULADOS.vespertino - 1) * 100)} %`);
    console.log("\n  Para quitar todo lo simulado: agrega --borrar\n");
  } finally {
    await database.disconnect();
  }
}

main().catch((err) => {
  console.error("\n💥", err.message);
  process.exit(1);
});
