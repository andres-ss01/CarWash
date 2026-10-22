// =============================================================================
// src/config/Database.js - Conexión a MySQL mediante una clase
// -----------------------------------------------------------------------------
// Usa un "pool" de conexiones (mysql2/promise) y se exporta como singleton.
// Novedades respecto al proyecto base:
//   - query() acepta una conexión opcional, para ejecutar dentro de una transacción.
//   - transaction(callback) abre, confirma (commit) o revierte (rollback) automáticamente.
//   - dateStrings: los DATETIME llegan como texto "YYYY-MM-DD HH:mm:ss" (sin zonas horarias).
// =============================================================================

import fs from "node:fs";
import mysql from "mysql2/promise";

// Offset (en minutos) de una zona IANA respecto a UTC, p. ej. America/Mexico_City -> -360
function offsetMinutos(timeZone) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(now);
  const v = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+v.year, +v.month - 1, +v.day, +v.hour, +v.minute, +v.second);
  return Math.round((asUtc - Math.floor(now.getTime() / 1000) * 1000) / 60000);
}

export default class Database {
  constructor() {
    this.pool = null; // Se crea en connect(), cuando ya se cargó el .env
  }

  getConfig() {
    const { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, DB_SSL, DB_SSL_CA, DB_SSL_CA_CONTENT } = process.env;

    if (!DB_HOST || !DB_USER || !DB_NAME) {
      throw new Error("Faltan variables de entorno (DB_HOST, DB_USER, DB_NAME). Revisa tu archivo .env");
    }

    const config = {
      host: DB_HOST,
      port: Number(DB_PORT) || 3306,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      charset: "utf8mb4",
    };

    // SSL/TLS: Aiven y casi toda base en la nube exigen conexión cifrada.
    // El certificado CA del proveedor se puede dar de dos formas:
    //   - DB_SSL_CA_CONTENT: el texto del certificado (ideal en Render/Railway, sin subir archivos)
    //   - DB_SSL_CA: ruta a un archivo .pem (cómodo en local)
    if (String(DB_SSL).toLowerCase() === "true") {
      let ca = null;
      if (DB_SSL_CA_CONTENT) ca = DB_SSL_CA_CONTENT.replace(/\\n/g, "\n"); // admite "\n" literales
      else if (DB_SSL_CA) ca = fs.readFileSync(DB_SSL_CA);

      config.ssl = ca
        ? { ca, rejectUnauthorized: true }
        : { minVersion: "TLSv1.2", rejectUnauthorized: true };
    }

    return config;
  }

  // Offset de sesión para MySQL, p. ej. "-06:00". Se toma de DB_TIMEZONE o de la zona APP_TZ.
  // Así NOW() coincide con la hora local de las citas aunque el servidor MySQL esté en UTC (Aiven).
  getSessionTimeZone() {
    const { DB_TIMEZONE } = process.env;
    if (DB_TIMEZONE) {
      if (!/^[+-]\d{2}:\d{2}$/.test(DB_TIMEZONE)) throw new Error('DB_TIMEZONE debe tener el formato "-06:00"');
      return DB_TIMEZONE;
    }
    // Vercel reserva la variable TZ y corre en UTC, por eso se usa APP_TZ (por defecto, México).
    const min = offsetMinutos(process.env.APP_TZ || process.env.TZ_NEGOCIO || "America/Mexico_City");
    const abs = Math.abs(min);
    const pad = (n) => String(n).padStart(2, "0");
    return `${min >= 0 ? "+" : "-"}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  }

  async connect() {
    try {
      this.pool = mysql.createPool({
        ...this.getConfig(),
        waitForConnections: true,
        connectionLimit: Number(process.env.DB_POOL_LIMIT) || 5, // en serverless cada instancia abre su propio pool
        decimalNumbers: true, // DECIMAL llega como número
        dateStrings: true,    // DATETIME llega como texto 'YYYY-MM-DD HH:mm:ss'
      });

      // Cada conexión nueva del pool queda con la zona horaria del negocio
      const offset = this.getSessionTimeZone();
      this.pool.pool.on("connection", (conn) => conn.query(`SET time_zone = '${offset}'`, () => {}));

      const conn = await this.pool.getConnection();
      conn.release();
      console.log(`✅ Conectado a MySQL (host: ${process.env.DB_HOST}, base: ${process.env.DB_NAME}, zona: ${offset})`);
    } catch (error) {
      throw new Error(`Error al conectar con MySQL: ${error.message}`);
    }
  }

  // Ejecuta una consulta con parámetros (?). Si se pasa `conn`, se ejecuta dentro de esa transacción.
  async query(sql, params = [], conn = null) {
    const [result] = await (conn || this.pool).query(sql, params);
    return result;
  }

  // Ejecuta varias operaciones como una unidad: o todas se guardan, o ninguna.
  //   await database.transaction(async (conn) => { await database.query(sql, p, conn); ... });
  async transaction(callback) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await callback(conn);
      await conn.commit();
      return result;
    } catch (error) {
      try { await conn.rollback(); } catch { /* conexión ya perdida */ }
      throw error;
    } finally {
      conn.release();
    }
  }

  // Ejecuta un script SQL con varias sentencias (solo lo usa el seeder).
  async runScript(sql) {
    const conn = await mysql.createConnection({ ...this.getConfig(), multipleStatements: true });
    try {
      await conn.query(sql);
    } finally {
      await conn.end();
    }
  }

  async disconnect() {
    if (this.pool) await this.pool.end();
    console.log("🔌 Conexión a MySQL cerrada");
  }
}

export const database = new Database();
