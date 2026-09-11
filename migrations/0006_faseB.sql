-- Fase B — B8: timestamp por tentativa para bônus de velocidade validado no servidor
ALTER TABLE attempts ADD COLUMN ultima_resposta_em TEXT;
