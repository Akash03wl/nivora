/**
 * NIVORA — Worker entry (Hono) — Fase 1 Fundação
 * Frontend: public/ | Backend: src/ | DB: D1 | IA: abstração pronta
 */

import { Hono } from 'hono';

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
};

const app = new Hono<{ Bindings: Env }>();

// Security headers (Fase 9 antecipado — base)
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'");
  c.header('Cache-Control', 'no-store');
});

app.get('/api/health', async (c) => {
  const env = c.env;
  // Verifica D1 quando disponível
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

// Placeholder modular — cada fase registra seu router
// Fase 2: auth, Fase 4: rooms, Fase 5: IA, Fase 6: attempts, Fase 7: scoring, etc.
app.all('/api/*', (c) => c.json({ erro: 'Rota ainda não implementada — Fase 1 Fundação concluída, aguarde Fase 2 (Auth)' }, 501));

export default app;
