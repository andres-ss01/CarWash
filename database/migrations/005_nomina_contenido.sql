-- =====================================================================
-- MIGRACIÓN 005 - Pago por día de los trabajadores, nómina semanal y "Sobre nosotros"
-- ---------------------------------------------------------------------
-- ADITIVA: solo CREATE TABLE IF NOT EXISTS. No borra ni modifica datos.
-- Ejecútala UNA vez sobre tu base (Aiven) desde Workbench o la consola.
-- =====================================================================

-- Cuánto se le paga a cada trabajador por día trabajado (lo define el administrador)
CREATE TABLE IF NOT EXISTS PagoDiaTrabajador (
  idTrabajador INT NOT NULL,
  pago_dia     DECIMAL(8,2) NOT NULL DEFAULT 0,
  actualizado  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (idTrabajador),
  CONSTRAINT fk_pagodia_trabajador FOREIGN KEY (idTrabajador)
    REFERENCES Trabajador (idUsuario) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT ck_pagodia CHECK (pago_dia >= 0)
) ENGINE=InnoDB;

-- Nómina de cada semana YA TERMINADA (lunes a domingo). Se "congela" al cerrar la semana,
-- así cambiar después la plantilla o el pago por día no altera el historial.
--   dias_completos = días trabajados (pago completo)
--   dias_medios    = días que descansó por aceptar una sugerencia de descanso (medio pago)
CREATE TABLE IF NOT EXISTS NominaSemana (
  idTrabajador   INT NOT NULL,
  semana         DATE NOT NULL,                     -- lunes de la semana
  dias_completos TINYINT NOT NULL DEFAULT 0,
  dias_medios    TINYINT NOT NULL DEFAULT 0,
  pago_dia       DECIMAL(8,2) NOT NULL,
  total          DECIMAL(10,2) NOT NULL,
  detalle        JSON NOT NULL,                     -- [{ fecha, estado, factor, monto }]
  cerrada        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (idTrabajador, semana),
  KEY idx_nomina_semana (semana),
  CONSTRAINT fk_nomina_trabajador FOREIGN KEY (idTrabajador)
    REFERENCES Trabajador (idUsuario) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- Textos editables de la app (por ahora "sobre_nosotros"), guardados como JSON
CREATE TABLE IF NOT EXISTS Contenido (
  clave       VARCHAR(40) NOT NULL,
  valor       JSON NOT NULL,
  actualizado DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (clave)
) ENGINE=InnoDB;
