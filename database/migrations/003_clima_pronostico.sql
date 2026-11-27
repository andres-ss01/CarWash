-- =====================================================================
-- MIGRACIÓN 003 - Foto del pronóstico (para entrenar el modelo de la Fase 13)
-- ---------------------------------------------------------------------
-- ADITIVA: solo CREATE TABLE IF NOT EXISTS. No borra ni modifica datos.
-- Ejecútala UNA vez sobre tu base (Aiven) desde Workbench o la consola.
--
-- Por qué: ClimaDia se sobrescribe con lo observado cuando el día pasa. El modelo, en cambio,
-- tendrá que predecir con el PRONÓSTICO (la víspera), así que debe entrenarse con lo que se
-- pronosticaba entonces. Esta tabla guarda una foto por cada día consultado.
-- =====================================================================

CREATE TABLE IF NOT EXISTS ClimaPronostico (
  fecha            DATE NOT NULL,                   -- día pronosticado
  emitido          DATE NOT NULL,                   -- día (local) en que se consultó el pronóstico
  dias_antes       TINYINT NOT NULL,                -- fecha - emitido (1 = la víspera, 0 = el mismo día)
  prob_lluvia      TINYINT NULL,
  prob_lluvia_mat  TINYINT NULL,
  prob_lluvia_vesp TINYINT NULL,
  precipitacion_mm DECIMAL(5,1) NULL,
  temp_max         DECIMAL(4,1) NULL,
  viento_max       DECIMAL(4,1) NULL,
  actualizado      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (fecha, emitido),
  KEY idx_pronostico_dias (dias_antes, fecha)
) ENGINE=InnoDB;
