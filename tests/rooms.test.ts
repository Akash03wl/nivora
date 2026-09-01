import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import app from '../src/index.js';

function createMockDB() {
  const sqlite = new DatabaseSync(':memory:');
  const dir = path.join(process.cwd(), 'migrations');
  for (const f of fs.readdirSync(dir).filter(x=>x.endsWith('.sql')).sort()) {
    sqlite.exec(fs.readFileSync(path.join(dir,f),'utf-8'));
  }
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
        }
      };
    },
    exec(sql: string) { sqlite.exec(sql); return { success: true }; }
  } as unknown as D1Database;
  return wrap;
}

async function req(app: any, url: string, method: string, body?: any, headers: Record<string,string> = {}, env: any = {}) {
  const init: RequestInit = { method, headers: { 'Content-Type': 'application/json', ...headers } };
  if (body !== undefined) init.body = JSON.stringify(body);
  const request = new Request(url, init);
  const e = { DB: (global as any).__DB, ENVIRONMENT: 'development', ...env };
  return app.fetch(request, e);
}

describe('Rooms Fase 4', () => {
  beforeEach(()=>{ (global as any).__DB = createMockDB(); });

  it('CRUD e estados: DRAFT->REVIEW->PUBLISHED->ACTIVE->CLOSED->ARCHIVED', async () => {
    // cria admin
    let r = await req(app, 'http://test/api/auth/register', 'POST', { nick: 'adm', email: 'adm@ex.com', senha: 'senha12345' });
    const cookieAdmin = (r.headers.get('Set-Cookie')||'').split(';')[0];
    // cria sala
    r = await req(app, 'http://test/api/rooms', 'POST', { nome: 'Simulado Mat', descricao: 'Desc', materia_id: 'matematica', assuntos: ['Função afim'], quantidade: 10, dificuldade: 'medio', tempo_por_questao: 30 }, { Cookie: cookieAdmin });
    expect(r.status).toBe(201);
    let d:any = await r.json();
    const id = d.room.id;
    expect(d.room.status).toBe('DRAFT');
    // tenta editar como USER (deve falhar)
    let r2 = await req(app, 'http://test/api/auth/register', 'POST', { nick: 'usr', email: 'usr@ex.com', senha: 'senha12345' });
    const cookieUser = (r2.headers.get('Set-Cookie')||'').split(';')[0];
    r2 = await req(app, `http://test/api/rooms/${id}`, 'PATCH', { nome: 'Hack' }, { Cookie: cookieUser });
    expect(r2.status).toBe(403);
    // transições válidas
    const trans = ['REVIEW','PUBLISHED','ACTIVE','CLOSED','ARCHIVED'];
    for (const st of trans) {
      const rr = await req(app, `http://test/api/rooms/${id}/status`, 'POST', { status: st }, { Cookie: cookieAdmin });
      expect(rr.status).toBe(200);
      const jd:any = await rr.json();
      expect(jd.room.status).toBe(st);
      if (st === 'PUBLISHED' || st === 'ACTIVE') expect(jd.room.codigo).toBeTruthy();
    }
    // transição inválida ARCHIVED->ACTIVE deve falhar 409
    const fail = await req(app, `http://test/api/rooms/${id}/status`, 'POST', { status: 'ACTIVE' }, { Cookie: cookieAdmin });
    expect(fail.status).toBe(409);
  });

  it('listagem: USER só vê PUBLISHED/ACTIVE/CLOSED', async () => {
    let r = await req(app, 'http://test/api/auth/register', 'POST', { nick: 'a1', email: 'a1@ex.com', senha: 'senha12345' });
    const cA = (r.headers.get('Set-Cookie')||'').split(';')[0];
    // cria 2 salas: uma fica DRAFT, outra vai para ACTIVE
    r = await req(app, 'http://test/api/rooms', 'POST', { nome: 'Rascunho', assuntos: ['Alg'], quantidade: 10, tempo_por_questao: 30 }, { Cookie: cA });
    const idDraft = (await r.json() as any).room.id;
    r = await req(app, 'http://test/api/rooms', 'POST', { nome: 'Ativa', assuntos: ['Alg'], quantidade: 10, tempo_por_questao: 30 }, { Cookie: cA });
    const idAtiva = (await r.json() as any).room.id;
    await req(app, `http://test/api/rooms/${idAtiva}/status`, 'POST', { status: 'REVIEW' }, { Cookie: cA });
    await req(app, `http://test/api/rooms/${idAtiva}/status`, 'POST', { status: 'PUBLISHED' }, { Cookie: cA });
    await req(app, `http://test/api/rooms/${idAtiva}/status`, 'POST', { status: 'ACTIVE' }, { Cookie: cA });

    // USER lista
    let ru = await req(app, 'http://test/api/auth/register', 'POST', { nick: 'u2', email: 'u2@ex.com', senha: 'senha12345' });
    const cU = (ru.headers.get('Set-Cookie')||'').split(';')[0];
    let list = await req(app, 'http://test/api/rooms', 'GET', undefined, { Cookie: cU });
    let j:any = await list.json();
    expect(j.rooms.some((x:any)=>x.id===idDraft)).toBe(false);
    expect(j.rooms.some((x:any)=>x.id===idAtiva)).toBe(true);

    // ADMIN vê tudo
    list = await req(app, 'http://test/api/rooms?status=DRAFT', 'GET', undefined, { Cookie: cA });
    j = await list.json();
    expect(j.rooms.some((x:any)=>x.id===idDraft)).toBe(true);
  });

  it('delete bloqueia se ACTIVE', async () => {
    let r = await req(app, 'http://test/api/auth/register', 'POST', { nick: 'ad3', email: 'ad3@ex.com', senha: 'senha12345' });
    const cA = (r.headers.get('Set-Cookie')||'').split(';')[0];
    r = await req(app, 'http://test/api/rooms', 'POST', { nome: 'Para deletar', assuntos: ['X'], quantidade: 10, tempo_por_questao: 30 }, { Cookie: cA });
    const id = (await r.json() as any).room.id;
    // ativa
    await req(app, `http://test/api/rooms/${id}/status`, 'POST', { status: 'REVIEW' }, { Cookie: cA });
    await req(app, `http://test/api/rooms/${id}/status`, 'POST', { status: 'PUBLISHED' }, { Cookie: cA });
    await req(app, `http://test/api/rooms/${id}/status`, 'POST', { status: 'ACTIVE' }, { Cookie: cA });
    let dr = await req(app, `http://test/api/rooms/${id}`, 'DELETE', undefined, { Cookie: cA });
    expect(dr.status).toBe(409);
    // fecha e deleta ok
    await req(app, `http://test/api/rooms/${id}/status`, 'POST', { status: 'CLOSED' }, { Cookie: cA });
    dr = await req(app, `http://test/api/rooms/${id}`, 'DELETE', undefined, { Cookie: cA });
    expect(dr.status).toBe(200);
  });
});
