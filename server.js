// =============================================================================
// server.js - Arranque LOCAL (npm start / npm run dev) y hosts con proceso fijo
// -----------------------------------------------------------------------------
// En Vercel NO se usa este archivo: ahí la entrada es api/index.js.
// =============================================================================

import app, { validarConfig, ensureDatabase } from "./src/app.js";

const port = process.env.PORT || 3000;

try {
  validarConfig();
  await ensureDatabase();
  app.listen(port, () => console.log(`🚀 Servidor escuchando en el puerto ${port}`));
} catch (error) {
  console.error("❌ No se pudo iniciar el servidor:", error.message);
  process.exit(1);
}
