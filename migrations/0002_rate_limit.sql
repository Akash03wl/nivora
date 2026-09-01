-- NIVORA — Migração 0002: rate_limit e ajustes Fase 2
CREATE TABLE IF NOT EXISTS rate_limit (
  chave TEXT PRIMARY KEY,
  contagem INTEGER NOT NULL DEFAULT 0,
  janela_expira INTEGER NOT NULL DEFAULT 0
);
-- Garante índice em sessions para expiração
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expira ON sessions(expira_em);
