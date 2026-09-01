-- NIVORA — Migração 0004: índices, scores e refinamentos Fase 3

-- Índices faltantes para performance (rooms, attempts, answers, etc.)
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_materia ON rooms(materia_id);
CREATE INDEX IF NOT EXISTS idx_rooms_criador ON rooms(criador_id);
CREATE INDEX IF NOT EXISTS idx_rooms_codigo ON rooms(codigo);
CREATE INDEX IF NOT EXISTS idx_questions_room ON questions(room_id);
CREATE INDEX IF NOT EXISTS idx_question_options_question ON question_options(question_id);
CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_attempts_room ON attempts(room_id);
CREATE INDEX IF NOT EXISTS idx_attempts_status ON attempts(status);
CREATE INDEX IF NOT EXISTS idx_answers_attempt ON answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_answers_question ON answers(question_id);
CREATE INDEX IF NOT EXISTS idx_ai_generations_room ON ai_generations(room_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_user ON admin_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_acao ON admin_logs(acao);
CREATE INDEX IF NOT EXISTS idx_admin_logs_criado ON admin_logs(criado_em);
CREATE INDEX IF NOT EXISTS idx_subjects_slug ON subjects(slug);

-- Scores: tabela explícita exigida no prompt #25 (espelha attempts.pontuacao para auditoria/ranking)
-- Mantém attempts.pontuacao como fonte, scores como histórico imutável
CREATE TABLE IF NOT EXISTS scores (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  acertos INTEGER NOT NULL DEFAULT 0,
  pontuacao INTEGER NOT NULL DEFAULT 0,
  tempo_total INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(attempt_id)
);
CREATE INDEX IF NOT EXISTS idx_scores_user ON scores(user_id);
CREATE INDEX IF NOT EXISTS idx_scores_room ON scores(room_id);
CREATE INDEX IF NOT EXISTS idx_scores_pontuacao ON scores(pontuacao DESC);
