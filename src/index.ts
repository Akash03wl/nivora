/**
 * NIVORA — Worker entry (Hono) — Fase 1 Fundação
 * Frontend: public/ | Backend: src/ | DB: D1 | IA: abstração pronta
 */

import { Hono } from 'hono';
import { auth } from './routes/auth.js';
import { rooms } from './routes/rooms.js';
import { attempts } from './routes/attempts.js';
import { history } from './routes/history.js';
import { SECURITY_HEADERS } from './lib/security.js';

type Env = {
  DB: D1Database;
  ENVIRONMENT: string;
  APP_NAME: string;
  APP_TAGLINE: string;
  SITE_URL: string;
  AI?: any;
  AI_MODEL?: string;
  AI_API_KEY?: string;
  AI_BASE_URL?: string;
  ADMIN_EMAIL?: string;
};

const app = new Hono<{ Bindings: Env }>();

// Security headers — única fonte da verdade (B11)
app.use('*', async (c, next) => {
  await next();
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) c.header(k, v);
});

app.get('/api/health', async (c) => {
  const env = c.env;
  let dbOk = false;
  try {
    if (env.DB) {
      await env.DB.prepare('SELECT 1 as ok').first();
      dbOk = true;
    }
  } catch {}
  return c.json({
    ok: true,
    app: env.APP_NAME || 'nivora',
    tagline: env.APP_TAGLINE || 'Aprenda. Supere. Evolua.',
    env: env.ENVIRONMENT || 'development',
    db: dbOk ? 'ok' : 'sem D1 (local)',
    time: new Date().toISOString()
  });
});

// Fase 2 — Auth | Fase 4 — Rooms | Fase 6 — Execução | Fase 8 — Histórico
app.route('/api/auth', auth);
app.route('/api/rooms', rooms);
app.route('/api/rooms', attempts);
app.route('/api/me', history);

app.all('/api/*', (c) => c.json({ erro: 'Rota não encontrada' }, 404));

export default app;
