# Backend de demostración (para enseñar el machine learning)

Idea: **dos copias del sistema que no se mezclan**.

| | Real | Demo |
|---|---|---|
| Base de datos (TiDB Cloud) | la del negocio | `carwash_pruebas` (historial simulado) |
| API (Vercel) | `car-wash-sigma-seven.vercel.app` | segundo proyecto, p. ej. `carwash-demo.vercel.app` |
| App Android | "JAVN Car Wash" (variante `real`) | "JAVN Demo" (variante `demo`), se instala aparte |

El código es el mismo repositorio: cada `git push` actualiza las dos APIs.

---

## Parte A · Base de pruebas con historial simulado

1. **TiDB Cloud ▸ tu clúster ▸ SQL Editor**: `CREATE DATABASE carwash_pruebas;`
2. En la carpeta del backend crea `.env.pruebas` (Git lo ignora):
   ```
   DB_HOST=gateway01.xxxx.prod.aws.tidbcloud.com
   DB_PORT=4000
   DB_USER=tuPrefijo.root
   DB_PASSWORD=tu_password
   DB_NAME=carwash_pruebas
   DB_SSL=true
   APP_TZ=America/Mexico_City
   JWT_SECRET=pruebas_simulacion_123456
   ```
3. Tablas + datos de demostración (borra y recrea **solo** `carwash_pruebas`):
   `$env:DOTENV_CONFIG_PATH=".env.pruebas"; npm run seed`
4. Historial simulado + entrenamiento:
   `npm run simular -- --env .env.pruebas --confirmar carwash_pruebas --semanas 16`
5. `Remove-Item Env:DOTENV_CONFIG_PATH`

## Parte B · Segundo proyecto en Vercel (API de demo)

1. https://vercel.com ▸ **Add New… ▸ Project** ▸ importa el **mismo** repositorio (`CarWash`).
2. **Project Name**: `carwash-demo`. Framework Preset: **Other**. No cambies Build/Output.
3. **Environment Variables** (las mismas del proyecto real, salvo las marcadas):
   | Variable | Valor |
   |---|---|
   | `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` | iguales a las del proyecto real (TiDB) |
   | `DB_NAME` | **`carwash_pruebas`** |
   | `DB_SSL` | `true` |
   | `APP_TZ` | `America/Mexico_City` |
   | `JWT_SECRET` | **uno nuevo** (distinto al real) |
   | `CRON_SECRET` | **uno nuevo** |
   | `SUGERENCIAS_MODO` | `activo` (en la demo sí se crean sugerencias) |
   | `NEGOCIO_LAT`, `NEGOCIO_LON` | las del negocio (opcional) |
   Genera secretos con: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
4. **Deploy**. Comprueba `https://carwash-demo.vercel.app/`: la lista debe incluir `modelo`, `nomina`, `contenido`.
   Si Vercel te dio otra URL (el nombre ya estaba tomado), usa esa en la Parte C.

## Parte C · App "JAVN Demo"

1. En `gradle.properties` de la app: `DEMO_API_URL=https://carwash-demo.vercel.app/` (con `/` al final).
2. Android Studio ▸ **View ▸ Tool Windows ▸ Build Variants** ▸ en `app` elige **`demoDebug`** ▸ ▶ Run.
   Se instala "JAVN Demo" junto a tu app real (cada una con su propia sesión).
3. Para volver a la real: Build Variants ▸ **`realDebug`**.

## Parte D · Guion de la demostración

1. Entra a "JAVN Demo" como admin: `admin@carwash.mx / Admin123!` (cuentas del seed, solo existen en la demo).
2. **Panel ▸ Modelo de demanda (machine learning)**: qué se usa, error del modelo contra las reglas,
   lo que aprendió (lluvia −, quincena +…), **Reentrenar ahora** e historial.
3. **Panel ▸ Personal de hoy**: "Predicción: modelo de machine learning".
4. Sugerencias para mañana (sin esperar el cron de las 18:00):
   ```powershell
   $api = "https://carwash-demo.vercel.app/api"
   $token = (Invoke-RestMethod -Method Post "$api/auth/login" -ContentType "application/json" -Body '{"correo":"admin@carwash.mx","contrasena":"Admin123!"}').token
   Invoke-RestMethod -Method Post "$api/sugerencias/generar" -Headers @{Authorization="Bearer $token"} -ContentType "application/json" -Body '{}' | ConvertTo-Json -Depth 6
   ```
   Si hay lluvia en el pronóstico y sobra personal → "descansar"; si falta personal → "trabajar".
   Puede salir 0 sugerencias si mañana el clima y el personal están equilibrados: es correcto.
5. Entra como trabajador (`luis@carwash.mx / Demo1234!`) ▸ **Mi semana**: sugerencia con Aceptar / Rechazar y su pago.
6. Para mostrar que **no se activa con pocos datos**: repite la Parte A paso 4 con `--semanas 6`
   y pulsa Reentrenar: dirá que faltan datos y seguirán las reglas.

**Antes de presentar** repite la Parte A paso 4: la simulación termina "ayer", así queda al día.

## Limpieza
- Quitar lo simulado: `npm run simular -- --env .env.pruebas --confirmar carwash_pruebas --borrar`
- Borrar la base: `DROP DATABASE carwash_pruebas;` (en el SQL Editor; revisa el nombre)
- Borrar el proyecto de Vercel: carwash-demo ▸ Settings ▸ General ▸ Delete Project
