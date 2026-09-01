-- NIVORA — Migração 0001: schema inicial (projeto novo, independente do quiz-ake-v2)
-- Entidades do prompt mestre: users, rooms/simulados, questions, options, attempts, answers, ai_generations, admin_logs

-- USUÁRIOS
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  nick TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  senha_hash TEXT NOT NULL,
  avatar TEXT,
  papel TEXT NOT NULL DEFAULT 'USER' CHECK (papel IN ('USER','ADMIN')),
  status TEXT NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo','bloqueado')),
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  ultimo_acesso TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_nick ON users(nick);

-- SESSÕES
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  expira_em TEXT NOT NULL
);

-- MATÉRIAS
CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- SALAS / SIMULADOS — estados do fluxo
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT NOT NULL DEFAULT '',
  materia_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  assuntos TEXT NOT NULL DEFAULT '[]',
  quantidade INTEGER NOT NULL DEFAULT 10,
  dificuldade TEXT NOT NULL DEFAULT 'medio' CHECK (dificuldade IN ('facil','medio','dificil','muito_dificil','personalizado')),
  tempo_por_questao INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','REVIEW','PUBLISHED','ACTIVE','CLOSED','ARCHIVED')),
  criador_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  codigo TEXT UNIQUE,
  criado_em TEXT NOT NULL DEFAULT (datetime('now')),
  atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- QUESTÕES
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  enunciado TEXT NOT NULL,
  explicacao TEXT NOT NULL DEFAULT '',
  dificuldade TEXT NOT NULL DEFAULT 'medio',
  assunto TEXT NOT NULL DEFAULT '',
  ordem INTEGER NOT NULL DEFAULT 0,
  correta_idx INTEGER NOT NULL,
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ALTERNATIVAS
CREATE TABLE IF NOT EXISTS question_options (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  ordem INTEGER NOT NULL
);

-- TENTATIVAS (1 por user por sala por padrão)
CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  iniciado_em TEXT NOT NULL DEFAULT (datetime('now')),
  finalizado_em TEXT,
  acertos INTEGER NOT NULL DEFAULT 0,
  erros INTEGER NOT NULL DEFAULT 0,
  pontuacao INTEGER NOT NULL DEFAULT 0,
  tempo_total INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento','finalizada')),
  UNIQUE(user_id, room_id)
);

-- RESPOSTAS
CREATE TABLE IF NOT EXISTS answers (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  alternativa_idx INTEGER,
  correta INTEGER NOT NULL DEFAULT 0,
  tempo_gasto INTEGER NOT NULL DEFAULT 0,
  UNIQUE(attempt_id, question_id)
);

-- GERAÇÕES IA (auditoria)
CREATE TABLE IF NOT EXISTS ai_generations (
  id TEXT PRIMARY KEY,
  room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
  provedor TEXT NOT NULL DEFAULT 'mock',
  modelo TEXT NOT NULL DEFAULT '',
  prompt TEXT NOT NULL DEFAULT '',
  resposta_raw TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'sucesso',
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);

-- LOGS ADMIN
CREATE TABLE IF NOT EXISTS admin_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  acao TEXT NOT NULL,
  alvo_tipo TEXT NOT NULL DEFAULT '',
  alvo_id TEXT NOT NULL DEFAULT '',
  detalhes TEXT NOT NULL DEFAULT '{}',
  criado_em TEXT NOT NULL DEFAULT (datetime('now'))
);
