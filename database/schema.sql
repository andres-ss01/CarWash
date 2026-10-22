-- =====================================================================
-- CAR WASHER - schema.sql
-- Solo tablas, catálogos y vista. Lo usa el seeder (npm run seed).
-- Es re-ejecutable: borra y recrea las tablas. NO crea la base de datos.
-- =====================================================================
SET FOREIGN_KEY_CHECKS = 0;
DROP VIEW  IF EXISTS vista_seguimiento_orden;
DROP TABLE IF EXISTS Notificacion, Pago, OrdenTrabajador, HistorialEstadoOrden, Orden,
                     EstadoOrden, CitaServicio, Cita, HorarioAtencion, ServicioPrecio,
                     Servicio, Vehiculo, TipoVehiculo, Trabajador, Administrador,
                     Cliente, Usuario;
SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- 1. USUARIOS (tabla padre + especializaciones)
-- =====================================================================
CREATE TABLE Usuario (
  idUsuario       INT NOT NULL AUTO_INCREMENT,
  nombre          VARCHAR(40)  NOT NULL,
  apellidos       VARCHAR(50)  NOT NULL,
  telefono        VARCHAR(20)  NOT NULL,
  correo          VARCHAR(100) NOT NULL,
  contrasena_hash VARCHAR(255) NOT NULL,            -- guardar hash (bcrypt/argon2), nunca texto plano
  rol             ENUM('cliente','administrador','trabajador') NOT NULL,
  activo          TINYINT(1)   NOT NULL DEFAULT 1,
  fecha_registro  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (idUsuario),
  UNIQUE KEY uq_usuario_correo (correo)
) ENGINE=InnoDB;

CREATE TABLE Cliente (
  idUsuario INT NOT NULL,
  PRIMARY KEY (idUsuario),
  CONSTRAINT fk_cliente_usuario FOREIGN KEY (idUsuario)
    REFERENCES Usuario (idUsuario) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE Administrador (
  idUsuario  INT NOT NULL,
  rfc        VARCHAR(13) NOT NULL,
  curp       VARCHAR(18) NOT NULL,
  PRIMARY KEY (idUsuario),
  UNIQUE KEY uq_admin_rfc (rfc),
  UNIQUE KEY uq_admin_curp (curp),
  CONSTRAINT fk_admin_usuario FOREIGN KEY (idUsuario)
    REFERENCES Usuario (idUsuario) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE Trabajador (
  idUsuario  INT NOT NULL,
  rfc        VARCHAR(13) NOT NULL,
  curp       VARCHAR(18) NOT NULL,
  turno      ENUM('matutino','vespertino','mixto') NOT NULL,
  PRIMARY KEY (idUsuario),
  UNIQUE KEY uq_trab_rfc (rfc),
  UNIQUE KEY uq_trab_curp (curp),
  CONSTRAINT fk_trab_usuario FOREIGN KEY (idUsuario)
    REFERENCES Usuario (idUsuario) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 2. VEHÍCULOS
-- =====================================================================
CREATE TABLE TipoVehiculo (
  idTipoVehiculo INT NOT NULL AUTO_INCREMENT,
  nombre         VARCHAR(40) NOT NULL,              -- Auto, SUV, Camioneta, Moto...
  PRIMARY KEY (idTipoVehiculo),
  UNIQUE KEY uq_tipovehiculo_nombre (nombre)
) ENGINE=InnoDB;

CREATE TABLE Vehiculo (
  idVehiculo     INT NOT NULL AUTO_INCREMENT,
  matricula      VARCHAR(11) NOT NULL,
  marca          VARCHAR(30) NOT NULL,
  modelo         VARCHAR(30) NOT NULL,
  color          VARCHAR(20) NULL,
  anio           SMALLINT NULL,
  idTipoVehiculo INT NOT NULL,
  idCliente      INT NOT NULL,
  PRIMARY KEY (idVehiculo),
  UNIQUE KEY uq_vehiculo_matricula (matricula),
  KEY idx_vehiculo_cliente (idCliente),
  CONSTRAINT fk_vehiculo_tipo FOREIGN KEY (idTipoVehiculo)
    REFERENCES TipoVehiculo (idTipoVehiculo) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_vehiculo_cliente FOREIGN KEY (idCliente)
    REFERENCES Cliente (idUsuario) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 3. CATÁLOGO DE SERVICIOS Y PRECIOS
--    (el servicio es un catálogo, ya NO depende de un vehículo)
-- =====================================================================
CREATE TABLE Servicio (
  idServicio   INT NOT NULL AUTO_INCREMENT,
  nombre       VARCHAR(45)  NOT NULL,               -- Básico, Premium, Detallado...
  descripcion  VARCHAR(255) NOT NULL,
  duracion_min SMALLINT     NOT NULL,               -- base para calcular horarios
  activo       TINYINT(1)   NOT NULL DEFAULT 1,
  PRIMARY KEY (idServicio),
  UNIQUE KEY uq_servicio_nombre (nombre),
  CONSTRAINT ck_servicio_duracion CHECK (duracion_min > 0)
) ENGINE=InnoDB;

CREATE TABLE ServicioPrecio (
  idServicio     INT NOT NULL,
  idTipoVehiculo INT NOT NULL,
  precio         DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (idServicio, idTipoVehiculo),
  CONSTRAINT fk_sp_servicio FOREIGN KEY (idServicio)
    REFERENCES Servicio (idServicio) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_sp_tipo FOREIGN KEY (idTipoVehiculo)
    REFERENCES TipoVehiculo (idTipoVehiculo) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT ck_sp_precio CHECK (precio >= 0)
) ENGINE=InnoDB;

-- =====================================================================
-- 4. HORARIOS DE ATENCIÓN
-- =====================================================================
CREATE TABLE HorarioAtencion (
  idHorario     INT NOT NULL AUTO_INCREMENT,
  dia_semana    TINYINT NOT NULL,                   -- 1=Lunes ... 7=Domingo
  hora_apertura TIME NOT NULL,
  hora_cierre   TIME NOT NULL,
  PRIMARY KEY (idHorario),
  UNIQUE KEY uq_horario_dia (dia_semana),
  CONSTRAINT ck_horario_dia CHECK (dia_semana BETWEEN 1 AND 7),
  CONSTRAINT ck_horario_horas CHECK (hora_cierre > hora_apertura)
) ENGINE=InnoDB;

-- =====================================================================
-- 5. CITAS (agendamiento remoto)
-- =====================================================================
CREATE TABLE Cita (
  idCita        INT NOT NULL AUTO_INCREMENT,
  idCliente     INT NOT NULL,
  idVehiculo    INT NOT NULL,
  fecha_hora_inicio DATETIME NOT NULL,
  fecha_hora_fin    DATETIME NOT NULL,              -- calculada con la duración de los servicios
  estado        ENUM('programada','confirmada','en_curso','completada','cancelada','no_asistio')
                NOT NULL DEFAULT 'programada',
  total_estimado DECIMAL(10,2) NOT NULL DEFAULT 0,
  notas         VARCHAR(255) NULL,
  fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (idCita),
  KEY idx_cita_cliente (idCliente),
  KEY idx_cita_vehiculo (idVehiculo),
  KEY idx_cita_fecha (fecha_hora_inicio),
  CONSTRAINT fk_cita_cliente FOREIGN KEY (idCliente)
    REFERENCES Cliente (idUsuario) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_cita_vehiculo FOREIGN KEY (idVehiculo)
    REFERENCES Vehiculo (idVehiculo) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT ck_cita_fechas CHECK (fecha_hora_fin > fecha_hora_inicio)
) ENGINE=InnoDB;

-- Servicios elegidos en una cita (sustituye a "agenda" e "incluye")
CREATE TABLE CitaServicio (
  idCita          INT NOT NULL,
  idServicio      INT NOT NULL,
  precio_aplicado DECIMAL(10,2) NOT NULL,           -- se congela el precio al agendar
  PRIMARY KEY (idCita, idServicio),
  CONSTRAINT fk_cs_cita FOREIGN KEY (idCita)
    REFERENCES Cita (idCita) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_cs_servicio FOREIGN KEY (idServicio)
    REFERENCES Servicio (idServicio) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 6. ÓRDENES Y MONITOREO EN TIEMPO REAL
-- =====================================================================
CREATE TABLE EstadoOrden (
  idEstadoOrden INT NOT NULL AUTO_INCREMENT,
  nombre        VARCHAR(30) NOT NULL,
  orden         TINYINT NOT NULL,                   -- posición en la barra de progreso
  PRIMARY KEY (idEstadoOrden),
  UNIQUE KEY uq_estado_nombre (nombre),
  UNIQUE KEY uq_estado_orden (orden)
) ENGINE=InnoDB;

CREATE TABLE Orden (
  idOrden        INT NOT NULL AUTO_INCREMENT,
  idCita         INT NOT NULL,                      -- 1 cita genera 1 orden
  idEstadoOrden  INT NOT NULL,                      -- estado actual
  fecha_inicio   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_termino  DATETIME NULL,
  total          DECIMAL(10,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (idOrden),
  UNIQUE KEY uq_orden_cita (idCita),
  KEY idx_orden_estado (idEstadoOrden),
  CONSTRAINT fk_orden_cita FOREIGN KEY (idCita)
    REFERENCES Cita (idCita) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_orden_estado FOREIGN KEY (idEstadoOrden)
    REFERENCES EstadoOrden (idEstadoOrden) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT ck_orden_fechas CHECK (fecha_termino IS NULL OR fecha_termino >= fecha_inicio)
) ENGINE=InnoDB;

-- Historial de cambios de estado (base del seguimiento)
CREATE TABLE HistorialEstadoOrden (
  idHistorial   INT NOT NULL AUTO_INCREMENT,
  idOrden       INT NOT NULL,
  idEstadoOrden INT NOT NULL,
  idUsuario     INT NULL,                           -- trabajador/admin que hizo el cambio
  fecha_cambio  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (idHistorial),
  KEY idx_hist_orden (idOrden, fecha_cambio),
  CONSTRAINT fk_hist_orden FOREIGN KEY (idOrden)
    REFERENCES Orden (idOrden) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_hist_estado FOREIGN KEY (idEstadoOrden)
    REFERENCES EstadoOrden (idEstadoOrden) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_hist_usuario FOREIGN KEY (idUsuario)
    REFERENCES Usuario (idUsuario) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- Trabajadores asignados a una orden (antes "atiende")
CREATE TABLE OrdenTrabajador (
  idOrden      INT NOT NULL,
  idTrabajador INT NOT NULL,
  PRIMARY KEY (idOrden, idTrabajador),
  CONSTRAINT fk_ot_orden FOREIGN KEY (idOrden)
    REFERENCES Orden (idOrden) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_ot_trabajador FOREIGN KEY (idTrabajador)
    REFERENCES Trabajador (idUsuario) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 7. PAGOS (Efectivo y Transaccion unificados en una sola tabla)
--    Nunca se guarda el número completo de tarjeta: solo los últimos 4
--    dígitos y la referencia que devuelva la pasarela de pago.
-- =====================================================================
CREATE TABLE Pago (
  idPago        INT NOT NULL AUTO_INCREMENT,
  idOrden       INT NOT NULL,
  monto         DECIMAL(10,2) NOT NULL,
  metodo        ENUM('efectivo','tarjeta','transferencia') NOT NULL,
  estado        ENUM('pendiente','pagado','rechazado','reembolsado') NOT NULL DEFAULT 'pendiente',
  fecha_pago    DATETIME NULL,
  referencia    VARCHAR(80) NULL,                   -- id de transacción de la pasarela
  ultimos4      CHAR(4) NULL,
  marca_tarjeta VARCHAR(20) NULL,
  PRIMARY KEY (idPago),
  KEY idx_pago_orden (idOrden),
  CONSTRAINT fk_pago_orden FOREIGN KEY (idOrden)
    REFERENCES Orden (idOrden) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT ck_pago_monto CHECK (monto > 0)
) ENGINE=InnoDB;

-- =====================================================================
-- 8. NOTIFICACIONES (avisos de cita y cambios de estatus)
-- =====================================================================
CREATE TABLE Notificacion (
  idNotificacion INT NOT NULL AUTO_INCREMENT,
  idUsuario      INT NOT NULL,
  idOrden        INT NULL,
  mensaje        VARCHAR(255) NOT NULL,
  leida          TINYINT(1) NOT NULL DEFAULT 0,
  fecha          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (idNotificacion),
  KEY idx_notif_usuario (idUsuario, leida),
  CONSTRAINT fk_notif_usuario FOREIGN KEY (idUsuario)
    REFERENCES Usuario (idUsuario) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_notif_orden FOREIGN KEY (idOrden)
    REFERENCES Orden (idOrden) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 9. DATOS INICIALES (catálogos)
-- =====================================================================
INSERT INTO EstadoOrden (nombre, orden) VALUES
  ('Recepción', 1),
  ('En Proceso', 2),
  ('Secado/Acabado', 3),
  ('Listo para Entrega', 4);

INSERT INTO TipoVehiculo (nombre) VALUES ('Auto'), ('SUV'), ('Camioneta'), ('Moto');

INSERT INTO Servicio (nombre, descripcion, duracion_min) VALUES
  ('Lavado Básico',   'Lavado exterior y secado',              20),
  ('Lavado Premium',  'Lavado exterior, aspirado y encerado',  40),
  ('Lavado Detallado','Limpieza profunda interior y exterior', 90);

INSERT INTO ServicioPrecio (idServicio, idTipoVehiculo, precio) VALUES
  (1,1,80),  (1,2,100), (1,3,120), (1,4,50),
  (2,1,150), (2,2,180), (2,3,210), (2,4,90),
  (3,1,350), (3,2,420), (3,3,500), (3,4,200);

INSERT INTO HorarioAtencion (dia_semana, hora_apertura, hora_cierre) VALUES
  (1,'08:00','18:00'), (2,'08:00','18:00'), (3,'08:00','18:00'),
  (4,'08:00','18:00'), (5,'08:00','18:00'), (6,'08:00','16:00');

-- =====================================================================
-- 10. VISTA PARA EL SEGUIMIENTO EN LA APP (barra de progreso del cliente)
-- =====================================================================
CREATE VIEW vista_seguimiento_orden AS
SELECT o.idOrden,
       c.idCliente,
       v.matricula,
       CONCAT(v.marca, ' ', v.modelo) AS vehiculo,
       e.nombre  AS estado_actual,
       e.orden   AS paso_actual,
       (SELECT MAX(orden) FROM EstadoOrden) AS total_pasos,
       o.fecha_inicio,
       o.fecha_termino,
       c.fecha_hora_fin AS entrega_estimada
FROM Orden o
JOIN Cita c         ON c.idCita = o.idCita
JOIN Vehiculo v     ON v.idVehiculo = c.idVehiculo
JOIN EstadoOrden e  ON e.idEstadoOrden = o.idEstadoOrden;
