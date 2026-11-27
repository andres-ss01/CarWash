# Fase 13 — Modelo de machine learning de la demanda

El sistema sugiere a los lavadores **descansar** (poca demanda, lluvia) o **venir de refuerzo** (mucha demanda).
Para eso necesita estimar **cuántos lavados habrá** en cada fecha y turno. Hasta la Fase 12 lo hacían unas
**reglas** (`reglas-v1`): promedio del mismo día de la semana × un factor fijo por lluvia. En la Fase 13 esa
estimación la hace un **modelo entrenado con los datos reales del negocio** (`modelo-v1`).

## 1. Qué predice y con qué

| | |
|---|---|
| **Objetivo (y)** | Lavados (citas no canceladas) en una fecha y turno (matutino 8–14 h, vespertino 14–20 h) |
| **Modelo** | Regresión de Poisson (GLM con enlace log) + regularización L2, entrenada con IRLS |
| **Código** | `src/utils/modeloDemanda.js` (puro, sin base de datos) · `src/services/ModeloService.js` |

**Variables de entrada (features)**, todas con lo que se sabía **la víspera a las 18:00**, que es cuando
el cron predice:

| Variable | Qué es |
|---|---|
| `base` | log(1 + promedio de lavados del mismo día de la semana y turno, últimas 8 semanas) |
| `vespertino` | 1 si es el turno de la tarde |
| `lluvia` | probabilidad de lluvia del turno (pronóstico) |
| `precipitacion` | log(1 + mm de lluvia pronosticados) |
| `temperatura` | temperatura máxima pronosticada |
| `agendadas` | log(1 + citas que ya estaban agendadas la víspera a las 18:00) |
| `finDeSemana` | sábado o domingo |
| `quincena` | días 15, 16, último y primero del mes |
| `festivo` | descansos obligatorios de la LFT (art. 74) |

**¿Por qué Poisson y no una red neuronal u otro modelo?**
- Lo que se predice es un **conteo** (0, 1, 2… lavados): Poisson nunca da negativos.
- Los efectos son **multiplicativos** (“la lluvia baja la demanda 30 %”), igual que en la realidad.
- Con **pocos meses de datos**, un modelo simple y regularizado generaliza mejor que uno complejo.
- Es **explicable**: cada coeficiente se traduce a una frase (ver `GET /api/modelo` → `efectos`).

## 2. Cómo se evita engañarse

1. **Sin fuga de información:** el clima de entrenamiento es el **pronóstico de la víspera**
   (`ClimaPronostico`, migración 003), no lo que llovió de verdad, porque al predecir solo se conoce el pronóstico.
   Las citas “agendadas” se cuentan como estaban la víspera a las 18:00 (`Cita.fecha_creacion`).
2. **Validación temporal:** se entrena con las fechas más viejas y se mide el error (MAE, lavados por turno)
   con el último 25 % de las fechas, como pasaría en la vida real.
3. **Compuerta de activación:** el modelo **solo se usa si le gana a las reglas** en esas fechas de prueba
   y hay al menos `MODELO_MIN_MUESTRAS` turnos (112 ≈ 8 semanas). Si no, se guarda en el historial y siguen las reglas.
4. **Respaldo:** si no hay modelo, falla la lectura o `MODELO_ML=off`, se usan las reglas sin interrumpir nada.

Con datos sintéticos (con efectos conocidos) el modelo recupera los efectos y se equivoca **~30 % menos**
que las reglas (`test/modelo.test.js`). Con datos reales el número saldrá en `mae_modelo` vs `mae_reglas`.

## 3. Puesta en marcha

1. Ejecuta en Aiven **una vez**: `database/migrations/003_clima_pronostico.sql` y `004_modelo_demanda.sql`.
2. Despliega (push a GitHub → Vercel).
3. Como **administrador**:
   - `POST /api/modelo/clima-historico` — trae el clima de las fechas pasadas (desde la primera cita) con
     los pronósticos archivados de Open-Meteo. Hazlo una vez.
   - `POST /api/modelo/entrenar` — entrena, valida y dice si quedó activo y por qué.
4. Después, el **cron diario** reentrena solo cada `MODELO_DIAS_REENTRENAR` días (7 por omisión).

## 4. Endpoints (👑 administrador)

| Método | Ruta | |
|---|---|---|
| GET | `/api/modelo` | Qué se está usando (modelo o reglas), modelo activo con sus `efectos` en palabras, historial de entrenamientos |
| POST | `/api/modelo/entrenar` | Entrena y valida; responde `maeModelo`, `maeReglas`, `mejora`, `activo`, `motivo`, `efectos` |
| POST | `/api/modelo/desactivar` | Vuelve a las reglas (el modelo queda en el historial) |
| POST | `/api/modelo/clima-historico` | `{ desde?, hasta? }` rellena el clima de días pasados |
| GET | `/api/modelo/datos?formato=csv` | Descarga las muestras de entrenamiento (para analizarlas en Excel o Python) |

`GET /api/panel/hoy` incluye `metodo` en cada turno, y la app muestra “Predicción: modelo de machine learning” o “reglas”.

## 5. Variables de entorno (opcionales)

| Variable | Por omisión | |
|---|---|---|
| `MODELO_ML` | `on` | `off` obliga a usar las reglas |
| `MODELO_MIN_MUESTRAS` | `112` | Turnos mínimos para activar el modelo |
| `MODELO_LAMBDA` | `2` | Regularización L2 (más alto = más conservador) |
| `MODELO_DIAS_REENTRENAR` | `7` | Cada cuántos días reentrena el cron |
| `MODELO_HORA_CORTE` | `18` | Hora de la víspera en que se “congelan” las citas agendadas |

## 6. Demostración con historial simulado (base de pruebas)

Con pocas citas reales el modelo no se activa (a propósito). Para demostrarlo sin esperar meses,
`scripts/simular_historial.js` llena una **base de pruebas aparte** con semanas de citas y clima
simulados, con efectos conocidos (lluvia −, quincena +, festivo −, tarde +), y entrena el modelo.

1. En TiDB Cloud (SQL Editor del clúster) o en Workbench conectado a TiDB: `CREATE DATABASE carwash_pruebas;`
2. Crea `.env.pruebas` (Git lo ignora) con los mismos datos de conexión que en Vercel
   (host `gateway01…tidbcloud.com`, puerto 4000, usuario `xxxx.root`), pero
   `DB_NAME=carwash_pruebas` y `DB_SSL=true` sin `DB_SSL_CA` (TiDB usa un certificado público).
3. Crea las tablas en esa base (el seed **borra y recrea**: revisa que `DB_NAME` sea la de pruebas):
   `$env:DOTENV_CONFIG_PATH=".env.pruebas"; npm run seed`
4. Simula y entrena:
   `npm run simular -- --env .env.pruebas --confirmar carwash_pruebas --semanas 16`
5. Para quitar lo simulado: el mismo comando con `--borrar`.

El script imprime el error del modelo contra el de las reglas, si quedó activo y lo que aprendió,
junto a los efectos programados, para compararlos. Candados: exige `--env` y `--confirmar` con el
nombre exacto de la base, solo corre en bases cuyo nombre contenga "prueba" y se detiene si la base
ya tiene citas reales.
`npm test` (test/simulacion.test.js) comprueba lo mismo sin base de datos.

## 7. Ideas para seguir mejorando

- **Personal por nivel de servicio:** en vez de cubrir el promedio, cubrir el percentil 80 de la Poisson
  para no quedarse cortos los días buenos.
- **Medir en producción:** comparar cada semana `PrediccionDemanda` contra los lavados reales.
- **Más variables** cuando haya más historial: temporada (vacaciones escolares), promociones, eventos locales.
