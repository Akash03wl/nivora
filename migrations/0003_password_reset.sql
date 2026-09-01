-- NIVORA — Migração 0003: recuperação de senha
CREATE TABLE IF NOT EXISTS password_resets (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  expira_em TEXT NOT NULL,
  usado INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);
