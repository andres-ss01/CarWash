# 🚗 Car Wash API REST — versión MySQL

API REST con **Node.js + Express**, arquitectura **MVC por capas** (Rutas → Controladores → Servicios → Modelos),
**POO con clases ES6** y **MySQL** (`mysql2`). Basada en el mismo patrón del proyecto `ecommerce-api-mysql`,
adaptada a la base de datos `carwash` (citas, órdenes con seguimiento en tiempo real, pagos y notificaciones).

## 📁 Estructura

```
carwash-api-mysql/
├── server.js                      # Arranque local (app.listen)
├── api/index.js                   # Entrada serverless para Vercel
├── vercel.json                    # Redirige todas las rutas a api/index.js
├── package.json
├── .env.example
├── database/
│   ├── schema.sql                 # Tablas + catálogos + vista (lo usa el seeder; re-ejecutable)
│   └── init-db.sql                # Tu script original completo (crea la base "carwash")
└── src/
    ├── app.js         App Express (sin listen) + conexión perezosa a MySQL
    ├── config/        Database.js (pool + transacciones) · config.js (parámetros del .env)
    ├── models/        SQL puro: Usuario, TipoVehiculo, Vehiculo, Servicio, Horario,
    │                  Cita, Orden, Pago, Notificacion
    ├── services/      Validación y reglas de negocio (una clase por módulo + AuthService)
    ├── controllers/   Capa HTTP (reciben req, llaman al servicio, responden)
    ├── routes/        Endpoints y permisos por rol
    ├── middlewares/   AuthMiddleware (JWT + roles) · errorHandler
    ├── utils/         AppError, asyncHandler, validators, fechas, permisos
    └── seed/          seed.js + data.js (usuarios, vehículos y citas de ejemplo)
```

## 🚀 Instalación

```bash
npm install
cp .env.example .env        # edita credenciales de MySQL y JWT_SECRET
npm run seed                # crea tablas, catálogos y datos de demo
npm start                   # o: npm run dev
```

Requisitos: **Node ≥ 18** y una base **MySQL ≥ 8.0.16** (el esquema usa `CHECK`). El proyecto viene configurado para
una base en la nube (**Aiven**); ver la sección siguiente. No necesitas crear la base ni ejecutar SQL a mano:
`npm run seed` crea las tablas dentro de la base que indiques en `DB_NAME` (en Aiven, `defaultdb`).

> ⚠️ `npm run seed` **borra y recrea** todas las tablas. No lo uses sobre datos reales.

Credenciales que imprime el seed: `admin@carwash.mx / Admin123!` · `luis@carwash.mx / Demo1234!` (trabajador) ·
`carlos@correo.com / Demo1234!` (cliente).

## ☁️ Conexión a Aiven (MySQL en la nube)

1. En https://console.aiven.io crea un servicio **MySQL** (plan Free) y espera a que su estado sea *Running*.
2. En la pestaña **Overview** copia **Host, Port, User** (normalmente `avnadmin`), **Password** y el nombre de la base (`defaultdb`).
3. Descarga el **CA certificate** y guárdalo como `ca.pem` en la raíz del proyecto (ya está en `.gitignore`).
4. En **Allowed IP addresses** agrega tu IP pública para probar desde tu computadora. Para Render/Railway, que cambian de IP,
   hay que permitir `0.0.0.0/0` (o usar la IP que indique el proveedor).
5. Rellena el `.env` (todo el bloque está comentado en `.env.example`):

```env
DB_HOST=mysql-xxxx-proyecto.a.aivencloud.com
DB_PORT=12345
DB_USER=avnadmin
DB_PASSWORD=********
DB_NAME=defaultdb
DB_SSL=true
DB_SSL_CA=./ca.pem
TZ=America/Mexico_City
JWT_SECRET=...
```

6. `npm run seed` y `npm start`. El log debe decir `Conectado a MySQL (host: ...aivencloud.com ...)`.

**Detalles que ya están resueltos en el código para la nube**
- **SSL con certificado CA**, desde archivo (`DB_SSL_CA`) o pegado en una variable (`DB_SSL_CA_CONTENT`, ideal para Render/Railway).
- **Zona horaria:** Aiven corre en UTC. Cada conexión del pool ejecuta `SET time_zone` con el offset de `TZ` (o `DB_TIMEZONE`),
  para que `NOW()` (inicio/término de órdenes, fecha de pago) coincida con la hora local de las citas.
- **Sin `CREATE DATABASE`:** `schema.sql` solo crea tablas, porque en Aiven la base ya existe. **No ejecutes `init-db.sql` en Aiven**
  (hace `DROP/CREATE DATABASE`); ese archivo es solo para MySQL local.
- Todas las tablas tienen llave primaria, requisito que Aiven aplica por defecto (`sql_require_primary_key`).

**Errores típicos con Aiven**
| Mensaje | Causa |
|---|---|
| `ETIMEDOUT` / `connect timed out` | Tu IP no está en *Allowed IP addresses*, o el servicio está apagado (los planes gratuitos pueden apagarse por inactividad: enciéndelo en la consola). |
| `self-signed certificate in certificate chain` | Falta el CA: revisa `DB_SSL_CA` (ruta correcta, archivo `ca.pem`) o `DB_SSL_CA_CONTENT`. |
| `ENOENT ... ca.pem` | El archivo no está en la raíz del proyecto o la ruta del `.env` es incorrecta. |
| `Access denied` | Contraseña o usuario mal copiados (cuidado con espacios al final). |

## 🔐 Autenticación y roles

Se agregó **JWT + bcrypt** (el proyecto base no tenía) porque la base guarda `contrasena_hash` y tiene roles.
Envía `Authorization: Bearer <token>` (lo devuelven `/auth/login` y `/auth/register`).

| Rol | Puede |
|-----|-------|
| **cliente** | Registrar y ver **sus** vehículos, agendar/cancelar **sus** citas, ver su orden, su seguimiento, sus pagos y notificaciones |
| **trabajador** | Todo lo de consulta + confirmar citas, crear órdenes, avanzar estados, registrar pagos |
| **administrador** | Todo lo anterior + usuarios, catálogos (servicios, precios, tipos, horarios), asignar trabajadores, reembolsos |

`/auth/register` **siempre** crea un cliente. Admin y trabajadores los da de alta un administrador en `POST /api/usuarios`.

## 📚 Endpoints

🔓 = público · 🔑 = requiere sesión · 👷 = staff (trabajador/admin) · 👑 = admin

**Auth** `/api/auth`
| Método | Ruta | |
|---|---|---|
| POST | `/register` | 🔓 Registro de cliente `{nombre, apellidos, telefono, correo, contrasena}` |
| POST | `/login` | 🔓 `{correo, contrasena}` → `{usuario, token}` |
| GET | `/me` | 🔑 Mi perfil |

**Usuarios** `/api/usuarios` — `GET ?rol=&activo=&limit=&sort=` 👑 · `POST` 👑 · `GET/PUT/PATCH /:id` 🔑 (propio o admin; el cliente no puede cambiar `activo`/`perfil`) · `DELETE /:id` 👑 (**baja lógica**, `activo = 0`)

**Catálogos**
| Ruta | Métodos |
|---|---|
| `/api/tipos-vehiculo` | `GET`, `GET /:id` 🔓 · `POST`, `PUT/PATCH /:id`, `DELETE /:id` 👑 |
| `/api/servicios` | `GET`, `GET /:id` 🔓 (con precios por tipo) · `GET /admin/todos`, `POST`, `PUT/PATCH /:id`, `DELETE /:id` 👑 (baja lógica) |
| `/api/horarios` | `GET` 🔓 · `PUT /:dia` (1=lun … 7=dom), `DELETE /:dia` 👑 |

**Vehículos** `/api/vehiculos` 🔑 — CRUD. El cliente solo ve/gestiona los suyos; el staff envía `idCliente`. No se puede borrar un vehículo con citas (la FK es `CASCADE` y se perdería el historial).

**Citas** `/api/citas`
| Método | Ruta | |
|---|---|---|
| GET | `/disponibilidad?fecha=2026-10-26&servicios=1,2` | 🔓 Horarios libres del día |
| GET | `/` `?estado=&fecha=&idCliente=&limit=&sort=` | 🔑 |
| GET | `/:id` | 🔑 con servicios y precios congelados |
| POST | `/` | 🔑 `{idVehiculo, fechaHoraInicio, servicios:[1,2], notas?}` |
| PATCH | `/:id/cancelar` | 🔑 dueño o staff |
| PATCH | `/:id/estado` | 👷 `{estado: confirmada\|cancelada\|no_asistio}` |

**Órdenes** `/api/ordenes` 🔑
| Método | Ruta | |
|---|---|---|
| GET | `/estados` | Catálogo de estados (para la barra de progreso) |
| GET | `/` `?abiertas=true&idEstadoOrden=` | Staff: todas · cliente: las suyas |
| GET | `/:id` | Detalle: servicios, trabajadores, total, pagado, saldo |
| GET | `/:id/seguimiento` | Paso actual, % de progreso, entrega estimada e historial |
| POST | `/` | 👷 `{idCita}` — el vehículo llegó |
| POST | `/:id/avanzar` | 👷 Pasa al siguiente estado |
| POST / DELETE | `/:id/trabajadores`, `/:id/trabajadores/:idTrabajador` | 👑 Asignar / quitar |

**Pagos** `/api/pagos` — `GET ?idOrden=&estado=` 🔑 · `GET /:id` 🔑 · `POST` 👷 · `PATCH /:id/estado` 👑

**Notificaciones** `/api/notificaciones` 🔑 — `GET ?leida=false` (incluye `noLeidas`) · `PATCH /:id/leida` · `PATCH /leer-todas`

## ⚙️ Reglas de negocio implementadas

**Agendar una cita**
- Debe ser futura y caer dentro del `HorarioAtencion` del día: el **inicio y el fin** (inicio + suma de `duracion_min`).
- El precio de cada servicio se **congela** en `CitaServicio.precio_aplicado` según el tipo de vehículo; si el servicio no tiene precio para ese tipo, se rechaza.
- Como el negocio no tiene bahías, la capacidad se controla con `CITAS_SIMULTANEAS` (por defecto 2 citas traslapadas). Un mismo vehículo no puede tener dos citas traslapadas.
- Se bloquea la fila del horario del día (`FOR UPDATE`) dentro de una transacción, así dos reservas simultáneas no exceden la capacidad.

**Órdenes y seguimiento**
- `POST /ordenes` crea la orden en el primer estado, pasa la cita a `en_curso` y notifica al cliente.
- Cada `avanzar` actualiza la orden, guarda `HistorialEstadoOrden` (con el usuario que lo hizo) y notifica, **todo en una transacción**.
- Al llegar al último estado se llena `fecha_termino` y la cita queda `completada`.
- Los estados salen de la tabla `EstadoOrden`: si agregas uno nuevo, el flujo y el porcentaje de progreso se adaptan solos.

**Pagos**
- Nunca se aceptan ni guardan número completo de tarjeta ni CVV (se responde 400 si llegan): solo `ultimos4`, `marcaTarjeta` y la `referencia` de la pasarela.
- Efectivo se registra como `pagado`; tarjeta y transferencia exigen `referencia`. Un pago puede quedar `pendiente`.
- La suma de pagos `pagado` no puede superar el `total` de la orden. Transiciones: `pendiente → pagado | rechazado`, `pagado → reembolsado`.

## 🧪 Flujo de ejemplo (curl)

```bash
API=http://localhost:3000/api

# 1) Login del cliente y consulta de horarios libres
TOKEN=$(curl -s $API/auth/login -H 'Content-Type: application/json' \
  -d '{"correo":"carlos@correo.com","contrasena":"Demo1234!"}' | jq -r .token)
curl "$API/citas/disponibilidad?fecha=2026-10-26&servicios=1,2"

# 2) Agendar
curl -X POST $API/citas -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"idVehiculo":1,"fechaHoraInicio":"2026-10-26 15:00","servicios":[1,2]}'

# 3) El trabajador recibe el vehículo y avanza la orden
STAFF=$(curl -s $API/auth/login -H 'Content-Type: application/json' \
  -d '{"correo":"luis@carwash.mx","contrasena":"Demo1234!"}' | jq -r .token)
curl -X POST $API/ordenes -H "Authorization: Bearer $STAFF" -H 'Content-Type: application/json' -d '{"idCita":5}'
curl -X POST $API/ordenes/2/avanzar -H "Authorization: Bearer $STAFF"

# 4) El cliente ve su progreso y sus avisos
curl $API/ordenes/2/seguimiento -H "Authorization: Bearer $TOKEN"
curl $API/notificaciones -H "Authorization: Bearer $TOKEN"
```

## 📦 Respuestas de error

`{ "status": "error", "message": "..." }` con: `400` datos inválidos · `401` sin sesión/token inválido · `403` sin permiso ·
`404` no encontrado · `409` conflicto (duplicado, horario lleno, transición no permitida, registro en uso) · `500` error interno.

## 🌐 Despliegue (Render / Railway + Aiven)

1. Sube el proyecto a GitHub (`.env` y `*.pem` están en `.gitignore`, no se suben).
2. En Render/Railway crea un servicio Node: *Build* `npm install`, *Start* `npm start`.
3. En sus variables de entorno agrega: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL=true`,
   `TZ=America/Mexico_City`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `CITAS_SIMULTANEAS`, `SLOT_MIN`.
4. **Certificado:** no subas el `.pem`. Abre `ca.pem`, copia todo su contenido y pégalo en la variable `DB_SSL_CA_CONTENT`
   (en una sola línea con `\n` entre líneas, o con saltos reales si la plataforma lo permite). No definas `DB_SSL_CA`.
5. En Aiven permite la IP del servicio (o `0.0.0.0/0`).
6. Carga las tablas **una vez**, ejecutando `npm run seed` desde tu computadora (con el `.env` apuntando a Aiven).
   ⚠️ El seed borra y recrea las tablas: no lo vuelvas a correr cuando ya tengas datos reales.

## 📝 Notas

- **Tiempo real:** el seguimiento funciona por *consulta* (`/seguimiento` + `/notificaciones`); la app puede hacer polling cada pocos segundos. Si más adelante quieres push instantáneo, se puede añadir Server-Sent Events o WebSockets sobre el mismo servicio sin tocar los modelos.
- **Bajas lógicas:** usuarios y servicios se desactivan en lugar de borrarse, para conservar citas, órdenes y pagos históricos.
- `init-db.sql` es tu script original sin cambios; `schema.sql` es el mismo sin `CREATE/DROP DATABASE` para que el seeder funcione también en bases en la nube.


## ▲ Despliegue en GitHub + Vercel

1. **Sube el código a GitHub** (el `.gitignore` ya excluye `.env` y `ca.pem`; verifica con `git status` que no aparezcan):
   ```bash
   git init
   git add .
   git commit -m "API Car Wash lista para Vercel"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
   git push -u origin main
   ```
2. En https://vercel.com/new importa el repositorio. Framework Preset: **Other**; no cambies Build/Output (déjalos vacíos).
3. En **Settings → Environment Variables** agrega (Production, Preview y Development):

   | Variable | Valor |
   |---|---|
   | `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Los de Aiven |
   | `DB_SSL` | `true` |
   | `DB_SSL_CA_CONTENT` | Contenido completo del certificado CA (`-----BEGIN CERTIFICATE-----` … `-----END CERTIFICATE-----`), pegado tal cual o con `\n` |
   | `JWT_SECRET` | Texto largo y aleatorio (≥ 16 caracteres) |
   | `JWT_EXPIRES_IN` | `1d` (opcional) |
   | `APP_TZ` | `America/Mexico_City` |
   | `CITAS_SIMULTANEAS`, `SLOT_MIN` | Opcionales |

   > No uses `TZ`: Vercel la reserva. No necesitas `PORT` ni `DB_SSL_CA`.
4. En Aiven → **Allowed IP addresses** permite `0.0.0.0/0` (Vercel no tiene IP fija en el plan gratuito).
5. **Deploy.** Prueba `https://TU-PROYECTO.vercel.app/` (health check) y `/api/servicios`.
6. Las tablas se crean con `npm run seed` **desde tu computadora** (apuntando a la misma base de Aiven); Vercel no ejecuta el seed.
