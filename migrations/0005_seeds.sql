-- NIVORA — Migração 0005: seeds Fase 3 (subjects + admin de desenvolvimento)

-- Subjects base (expandível, conforme Fase 5)
INSERT OR IGNORE INTO subjects (id, nome, slug) VALUES
  ('matematica', 'Matemática', 'matematica'),
  ('portugues', 'Português', 'portugues'),
  ('historia', 'História', 'historia'),
  ('geografia', 'Geografia', 'geografia'),
  ('ciencias', 'Ciências', 'ciencias'),
  ('geral', 'Conhecimentos Gerais', 'geral');

-- Nota: admin de teste NÃO é criado aqui com senha fixa.
-- Primeiro usuário registrado via /api/auth/register vira ADMIN automaticamente (Fase 2).
-- Para dev local, use ADMIN_EMAIL no .dev.vars para forçar papel ADMIN.
