import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import app from '../src/index.js';

// Helper D1 mock via node:sqlite
function createMockDB() {
  const sqlite = new DatabaseSync(':memory:');
  const migrationsDir = path.join(process.cwd(), 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf-8');
    // exec multi-statement (split by ; ignoring comments)
    sqlite.exec(sql);
  }
  // Wrap to D1-like
  const wrap = {
    prepare(sql: string) {
      const stmt: any = sqlite.prepare(sql);
      return {
        bind(...params: unknown[]) {
          return {
            first: (col?: string) => {
              const row = stmt.get(...params) as any;
              if (row === undefined) return null;
              if (col) return row[col] ?? null;
              return row;
            },
            all: () => ({ results: stmt.all(...params) || [] }),
            run: () => {
              const r = stmt.run(...params);
              return { meta: { changes: r.changes } };
            }
          };
        },
        first: () => null,
        all: () => ({ results: [] }),
        run: () => ({ meta: { changes: 0 } })
      };
    },
    batch(statements: any[]) { sqlite.exec('BEGIN'); try { const results = statements.map(s => s.run()); sqlite.exec('COMMIT'); return results; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } },
    exec(sql: string) { sqlite.exec(sql); return { success: true }; },
  } as unknown as D1Database;
  return wrap;
}

async function request(app: any, url: string, method: string, body?: any, headers: Record<string,string> = {}) {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json', ...headers } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const req = new Request(url, init);
  const env: any = { DB: (global as any).__DB, ENVIRONMENT: 'development' };
  return app.fetch(req, env);
}

describe('Auth Fase 2', () => {
  beforeEach(() => {
    (global as any).__DB = createMockDB();
  });

  it('register: nick único, email único, primeiro vira ADMIN', async () => {
    let r = await request(app, 'http://test/api/auth/register', 'POST', { nick: 'ana', email: 'ana@ex.com', senha: 'senha12345' });
    expect(r.status).toBe(201);
    let d: any = await r.json();
    expect(d.usuario.nick).toBe('ana');
    expect(d.usuario.papel).toBe('ADMIN');

    // segundo usuário deve ser USER
    r = await request(app, 'http://test/api/auth/register', 'POST', { nick: 'bob', email: 'bob@ex.com', senha: 'senha12345' });
    d = await r.json();
    expect(d.usuario.papel).toBe('USER');

    // nick duplicado
    r = await request(app, 'http://test/api/auth/register', 'POST', { nick: 'ana', email: 'ana2@ex.com', senha: 'senha12345' });
    expect(r.status).toBe(409);

    // email duplicado
    r = await request(app, 'http://test/api/auth/register', 'POST', { nick: 'ana2', email: 'ana@ex.com', senha: 'senha12345' });
    expect(r.status).toBe(409);
  });

  it('login e me', async () => {
    await request(app, 'http://test/api/auth/register', 'POST', { nick: 'carlos', email: 'carlos@ex.com', senha: 'senha12345' });
    // senha errada
    let r = await request(app, 'http://test/api/auth/login', 'POST', { email: 'carlos@ex.com', senha: 'errada123' });
    expect(r.status).toBe(401);
    // correta
    r = await request(app, 'http://test/api/auth/login', 'POST', { email: 'carlos@ex.com', senha: 'senha12345' });
    expect(r.status).toBe(200);
    const cookie = r.headers.get('Set-Cookie') || '';
    expect(cookie).toContain('nivora_sessao');
    expect(cookie).toContain('HttpOnly');

    // me sem cookie = 401
    let r2 = await request(app, 'http://test/api/auth/me', 'GET');
    expect(r2.status).toBe(401);
    // com cookie = 200
    r2 = await request(app, 'http://test/api/auth/me', 'GET', undefined, { Cookie: cookie.split(';')[0] });
    expect(r2.status).toBe(200);
    const d: any = await r2.json();
    expect(d.usuario.nick).toBe('carlos');
  });

  it('patch nick e avatar', async () => {
    let r = await request(app, 'http://test/api/auth/register', 'POST', { nick: 'diana', email: 'diana@ex.com', senha: 'senha12345' });
    const cookie = (r.headers.get('Set-Cookie') || '').split(';')[0];
    r = await request(app, 'http://test/api/auth/me', 'PATCH', { nick: 'diana2', avatar: '🎀' }, { Cookie: cookie });
    expect(r.status).toBe(200);
    const d: any = await r.json();
    expect(d.usuario.nick).toBe('diana2');
  });

  it('admin ping: USER 403, ADMIN 200', async () => {
    // primeiro = ADMIN
    let r = await request(app, 'http://test/api/auth/register', 'POST', { nick: 'adm', email: 'adm@ex.com', senha: 'senha12345' });
    const cookieAdmin = (r.headers.get('Set-Cookie') || '').split(';')[0];
    r = await request(app, 'http://test/api/auth/register', 'POST', { nick: 'usr', email: 'usr@ex.com', senha: 'senha12345' });
    const cookieUser = (r.headers.get('Set-Cookie') || '').split(';')[0];

    let pr = await request(app, 'http://test/api/auth/admin/ping', 'GET', undefined, { Cookie: cookieUser });
    expect(pr.status).toBe(403);
    pr = await request(app, 'http://test/api/auth/admin/ping', 'GET', undefined, { Cookie: cookieAdmin });
    expect(pr.status).toBe(200);
  });

  it('logout limpa sessão', async () => {
    let r = await request(app, 'http://test/api/auth/register', 'POST', { nick: 'ed', email: 'ed@ex.com', senha: 'senha12345' });
    const cookie = (r.headers.get('Set-Cookie') || '').split(';')[0];
    r = await request(app, 'http://test/api/auth/logout', 'POST', undefined, { Cookie: cookie });
    expect(r.status).toBe(200);
    const r2 = await request(app, 'http://test/api/auth/me', 'GET', undefined, { Cookie: cookie });
    expect(r2.status).toBe(401);
  });

  it('rate limit bloqueia após limite', async () => {
    // cria DB fresco para testar rate limit isolado
    // B16: limite de cadastro subiu para 20/min (cadastro em lote de turma é cenário esperado)
    for (let i = 0; i < 20; i++) {
      await request(app, 'http://test/api/auth/register', 'POST', { nick: `u${i}`, email: `u${i}@ex.com`, senha: 'senha12345' });
    }
    // 21ª tentativa na mesma janela deve ser 429 (limite 20/min)
    const r = await request(app, 'http://test/api/auth/register', 'POST', { nick: 'u20', email: 'u20@ex.com', senha: 'senha12345' });
    expect(r.status).toBe(429);
  });
});
