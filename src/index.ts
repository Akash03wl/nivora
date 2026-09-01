/**
 * NIVORA — Worker entry (Hono)
 * Fase 0: projeto novo e independente do quiz-ake-v2.
 * Próximo: Fase 1 — Fundação (router, auth, db, IA)
 */

import { Hono } from 'hono';

type Env = {
  DB: D1Database;
  ENVIRONMENT: string;
  APP_NAME: string;
  AI?: any;
  AI_MODEL?: string;
  AI_API_KEY?: string;
  AI_BASE_URL?: string;
};

const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) => {
  return c.json({ ok: true, app: 'nivora', tagline: 'Aprenda. Supere. Evolua.', time: new Date().toISOString() });
});

// Placeholder — rotas reais nas próximas fases (auth, simulados, IA, tentativas, ranking)
app.all('/api/*', (c) => c.json({ erro: 'Rota ainda não implementada — Fase 1 pendente' }, 501));

export default app;
