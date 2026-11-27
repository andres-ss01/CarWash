-- =====================================================================
-- MIGRACIÓN 004 - Modelos de machine learning de la demanda (Fase 13)
-- ---------------------------------------------------------------------
-- ADITIVA: solo CREATE TABLE IF NOT EXISTS. No borra ni modifica datos.
-- Ejecútala UNA vez sobre tu base (Aiven) desde Workbench o la consola.
--
-- Cada entrenamiento guarda una fila: sus parámetros (coeficientes), cuántos datos usó y su
-- error contra las reglas. Solo una fila queda activa: la que se usa para predecir.
-- =====================================================================

CREATE TABLE IF NOT EXISTS ModeloDemanda (
  idModelo    INT NOT NULL AUTO_INCREMENT,
  version     VARCHAR(30) NOT NULL,                -- 'poisson-v1'
  entrenado   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  muestras    INT NOT NULL,                        -- turnos (fecha + turno) usados
  desde       DATE NULL,
  hasta       DATE NULL,
  mae_modelo  DECIMAL(7,3) NULL,                   -- error medio (lavados) en las fechas de prueba
  mae_reglas  DECIMAL(7,3) NULL,                   -- error de las reglas en esas mismas fechas
  activo      TINYINT(1) NOT NULL DEFAULT 0,       -- 1 = se usa para predecir
  motivo      VARCHAR(200) NULL,
  parametros  JSON NOT NULL,                       -- coeficientes, medias y desviaciones
  PRIMARY KEY (idModelo),
  KEY idx_modelo_activo (activo, entrenado)
) ENGINE=InnoDB;
