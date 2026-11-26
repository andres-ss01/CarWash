-- =====================================================================
-- MIGRACIÓN 002 - Cronograma de trabajadores, clima y sugerencias (Fase 11)
-- ---------------------------------------------------------------------
-- ADITIVA: solo CREATE TABLE IF NOT EXISTS. No borra ni modifica datos.
-- Ejecútala UNA vez sobre la base que ya tienes (Aiven) desde Workbench o la consola.
-- NO uses "npm run seed" en producción: ese script borra y recrea todas las tablas.
-- =====================================================================

-- Plantilla semanal: ¿el trabajador trabaja ese día de la semana?
-- Si no hay fila, se asume que SÍ trabaja (así no hay que llenar nada al inicio).
CREATE TABLE IF NOT EXISTS CronogramaTrabajador (
  idTrabajador INT NOT NULL,
  dia_semana   TINYINT NOT NULL,                    -- 1=Lunes ... 7=Domingo
  trabaja      TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (idTrabajador, dia_semana),
  CONSTRAINT fk_cron_trabajador FOREIGN KEY (idTrabajador)
    REFERENCES Trabajador (idUsuario) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT ck_cron_dia CHECK (dia_semana BETWEEN 1 AND 7)
) ENGINE=InnoDB;

-- Excepciones de UNA fecha concreta (no cambian la plantilla):
--   descansa = descansa ese día (por clima aceptado, o decidido por el admin)
--   trabaja  = trabaja aunque su plantilla diga descanso (día extra)
--   ausente  = "ausente solo hoy"
CREATE TABLE IF NOT EXISTS ExcepcionDia (
  idExcepcion    INT NOT NULL AUTO_INCREMENT,
  idTrabajador   INT NOT NULL,
  fecha          DATE NOT NULL,
  estado         ENUM('descansa','trabaja','ausente') NOT NULL,
  origen         ENUM('admin','sugerencia','trabajador') NOT NULL,
  idSugerencia   INT NULL,
  nota           VARCHAR(120) NULL,
  fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (idExcepcion),
  UNIQUE KEY uq_excepcion_dia (idTrabajador, fecha),
  KEY idx_excepcion_fecha (fecha),
  CONSTRAINT fk_exc_trabajador FOREIGN KEY (idTrabajador)
    REFERENCES Trabajador (idUsuario) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- Clima por día (pronóstico y, cuando el día ya pasó, lo observado). Sirve también como
-- histórico para entrenar el modelo de demanda más adelante.
CREATE TABLE IF NOT EXISTS ClimaDia (
  fecha            DATE NOT NULL,
  prob_lluvia      TINYINT NULL,                    -- % máximo del día
  prob_lluvia_mat  TINYINT NULL,                    -- % máximo dentro del turno matutino
  prob_lluvia_vesp TINYINT NULL,                    -- % máximo dentro del turno vespertino
  precipitacion_mm DECIMAL(5,1) NULL,
  temp_max         DECIMAL(4,1) NULL,
  viento_max       DECIMAL(4,1) NULL,
  observado        TINYINT(1) NOT NULL DEFAULT 0,   -- 1 = el día ya pasó
  actualizado      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (fecha)
) ENGINE=InnoDB;

-- Lavados esperados y lavadores necesarios por fecha y turno
CREATE TABLE IF NOT EXISTS PrediccionDemanda (
  fecha                   DATE NOT NULL,
  turno                   ENUM('matutino','vespertino') NOT NULL,
  lavados_estimados       DECIMAL(6,1) NOT NULL,
  trabajadores_necesarios TINYINT NOT NULL,
  metodo                  VARCHAR(30) NOT NULL,     -- 'reglas-v1' ahora; 'modelo-v1' cuando haya ML
  actualizado             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (fecha, turno)
) ENGINE=InnoDB;

-- Sugerencias para el trabajador: descansar (poca demanda) o trabajar (refuerzo voluntario)
CREATE TABLE IF NOT EXISTS Sugerencia (
  idSugerencia    INT NOT NULL AUTO_INCREMENT,
  idTrabajador    INT NOT NULL,
  fecha           DATE NOT NULL,
  tipo            ENUM('descansar','trabajar') NOT NULL,
  motivo          VARCHAR(200) NOT NULL,
  estado          ENUM('pendiente','aceptada','rechazada','expirada') NOT NULL DEFAULT 'pendiente',
  fecha_creacion  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_respuesta DATETIME NULL,
  PRIMARY KEY (idSugerencia),
  UNIQUE KEY uq_sugerencia_dia (idTrabajador, fecha),
  KEY idx_sugerencia_fecha (fecha, estado),
  CONSTRAINT fk_sug_trabajador FOREIGN KEY (idTrabajador)
    REFERENCES Trabajador (idUsuario) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;
