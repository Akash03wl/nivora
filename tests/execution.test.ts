import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import app from '../src/index.js';

function mockDB() {
  const sqlite = new DatabaseSync(':memory:');
  const dir = path.join(process.cwd(), 'migrations');
  for (const f of fs.readdirSync(dir).filter(x=>x.endsWith('.sql')).sort()) sqlite.exec(fs.readFileSync(path.join(dir,f),'utf-8'));
  return {
    prepare(sql:string){
      const stmt:any=sqlite.prepare(sql);
      return { bind(...p:unknown[]){ return { first:(c?:string)=>{ const r=stmt.get(...p) as any; if(r===undefined) return null; return c? r[c]: r; }, all:()=>({results:stmt.all(...p)||[]}), run:()=>{ const r=stmt.run(...p); return {meta:{changes:r.changes}}; } }; } };
    }, batch(statements: any[]) { sqlite.exec('BEGIN'); try { const results = statements.map(s => s.run()); sqlite.exec('COMMIT'); return results; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } },
    exec(sql: string){ sqlite.exec(sql); return {success:true}; }
  } as unknown as D1Database;
}
async function req(app:any, url:string, method:string, body?:any, headers:Record<string,string>={}, env:any={}) {
  const init:any={ method, headers:{'Content-Type':'application/json',...headers} };
  if(body!==undefined) init.body=JSON.stringify(body);
  return app.fetch(new Request(url, init), { DB:(global as any).__DB, ENVIRONMENT:'development', ...env });
}

describe('Execução Fase 6', () => {
  beforeEach(()=>{ (global as any).__DB = mockDB(); });
  afterEach(()=>{ vi.useRealTimers(); });

  it('ENEM: aceita alternativa E existente e protege gabarito e pontuação do aluno', async () => {
    const db = (global as any).__DB;
    db.exec(fs.readFileSync('content/enem-2026.sql','utf8'));
    const reg = await req(app,'http://test/api/auth/register','POST',{nick:'enem-aluno',email:'enem@example.test',senha:'TesteEnem2026!'}, {}, {ENVIRONMENT:'production'});
    const cookie = (reg.headers.get('Set-Cookie')||'').split(';')[0];
    const base = 'http://test/api/rooms/nivora_enem_v1_quimica';
    const start = await req(app,base+'/start','POST',{}, {Cookie:cookie});
    expect(start.status).toBe(201);
    const data:any = await start.json();
    expect(data.questoes[0].alternativas).toHaveLength(5);
    expect(data.questoes[0].correta_idx).toBeUndefined();
    const publicQuestions:any = await (await req(app,base+'/questions','GET',undefined,{Cookie:cookie})).json();
    expect(publicQuestions.questoes[0].correta_idx).toBeUndefined();
    expect(publicQuestions.questoes[0].explicacao).toBeUndefined();
    const answer = await req(app,base+'/answer','POST',{question_id:data.questoes[0].id,alternativa_idx:4},{Cookie:cookie});
    expect(answer.status).toBe(200);
    expect((await answer.json() as any).correta).toBe(true);
    const invalid = await req(app,base+'/answer','POST',{question_id:data.questoes[1].id,alternativa_idx:99},{Cookie:cookie});
    expect((await invalid.json() as any).correta).toBe(false);
    const finish = await req(app,base+'/finish','POST',{}, {Cookie:cookie});
    expect((await finish.json() as any).resultado.acertos).toBe(1);
  });

  it('fluxo completo: start → answer → finish com proteção', async () => {
    // B8: o tempo de cada questão é medido no servidor (relógio fake avança entre chamadas)
    vi.useFakeTimers({ now: new Date('2026-01-01T00:00:00.000Z') });
    // admin cria sala e gera questões
    let r = await req(app,'http://test/api/auth/register','POST',{ nick:'adm', email:'adm@ex.com', senha:'senha12345' });
    const cA = (r.headers.get('Set-Cookie')||'').split(';')[0];
    r = await req(app,'http://test/api/rooms','POST',{ nome:'Simulado Exec', assuntos:['Alg'], quantidade:10, tempo_por_questao:30, materia_id:'geral' }, { Cookie: cA });
    const roomId = (await r.json() as any).room.id;
    // gera
    r = await req(app,`http://test/api/rooms/${roomId}/generate`,'POST',{}, { Cookie: cA });
    expect(r.status).toBe(200);
    // publica → ativa
    await req(app,`http://test/api/rooms/${roomId}/status`,'POST',{ status:'REVIEW' }, { Cookie: cA });
    await req(app,`http://test/api/rooms/${roomId}/status`,'POST',{ status:'PUBLISHED' }, { Cookie: cA });
    await req(app,`http://test/api/rooms/${roomId}/status`,'POST',{ status:'ACTIVE' }, { Cookie: cA });

    // user registra
    r = await req(app,'http://test/api/auth/register','POST',{ nick:'aluno', email:'aluno@ex.com', senha:'senha12345' });
    const cU = (r.headers.get('Set-Cookie')||'').split(';')[0];

    // start
    r = await req(app,`http://test/api/rooms/${roomId}/start`,'POST',{}, { Cookie: cU });
    expect(r.status).toBe(201);
    let j:any = await r.json();
    expect(j.questoes).toHaveLength(10);
    expect(j.questoes[0].correta_idx).toBeUndefined(); // sem gabarito
    const q1 = j.questoes[0].id;
    const q2 = j.questoes[1].id;

    // pega gabarito via admin para saber correta
    let adminQs = await req(app,`http://test/api/rooms/${roomId}/questions`,'GET',undefined,{ Cookie: cA });
    let qs:any = await adminQs.json();
    const gab = qs.questoes.find((x:any)=>x.id===q1).correta_idx;

    // answer correta rápida (bonus max)
    r = await req(app,`http://test/api/rooms/${roomId}/answer`,'POST',{ question_id:q1, alternativa_idx:gab, tempo_gasto:3 }, { Cookie: cU });
    expect(r.status).toBe(200);
    let ar:any = await r.json();
    expect(ar.correta).toBe(true);

    // tenta responder mesma questão de novo → 409
    r = await req(app,`http://test/api/rooms/${roomId}/answer`,'POST',{ question_id:q1, alternativa_idx:gab, tempo_gasto:2 }, { Cookie: cU });
    expect(r.status).toBe(409);

    // answer após o tempo limite real: o servidor mede 31s > limite 30s (B8, não confia no cliente)
    vi.advanceTimersByTime(31000);
    r = await req(app,`http://test/api/rooms/${roomId}/answer`,'POST',{ question_id:q2, alternativa_idx:0 }, { Cookie: cU });
    expect(r.status).toBe(200);
    ar = await r.json();
    expect(ar.expirada).toBe(true);

    // finish
    r = await req(app,`http://test/api/rooms/${roomId}/finish`,'POST',{}, { Cookie: cU });
    expect(r.status).toBe(200);
    j = await r.json();
    expect(j.resultado.acertos).toBe(1); // só 1 correto (q1), q2 expirada não conta
    expect(j.resultado.total).toBe(10);
    expect(j.gabarito).toHaveLength(10);
    expect(j.gabarito[0].correta_idx).toBeDefined(); // gabarito só após finish
    expect(j.resultado.pontuacao).toBeGreaterThan(100); // 100 + bonus

    // tenta responder após finish → 409
    r = await req(app,`http://test/api/rooms/${roomId}/answer`,'POST',{ question_id:qs.questoes[2].id, alternativa_idx:0, tempo_gasto:2 }, { Cookie: cU });
    expect(r.status).toBe(409);

    // segunda tentativa de start → 409 (1 tentativa)
    r = await req(app,`http://test/api/rooms/${roomId}/start`,'POST',{}, { Cookie: cU });
    expect(r.status).toBe(409);
  });

  it('B12: corrida em /start não gera 500 — só uma tentativa, segunda responde 409/retomada', async () => {
    // admin cria sala e gera questões
    let r = await req(app,'http://test/api/auth/register','POST',{ nick:'admb12', email:'admb12@ex.com', senha:'senha12345' });
    const cA = (r.headers.get('Set-Cookie')||'').split(';')[0];
    r = await req(app,'http://test/api/rooms','POST',{ nome:'Corrida', assuntos:['Alg'], quantidade:10, tempo_por_questao:30 }, { Cookie: cA });
    const roomId = (await r.json() as any).room.id;
    await req(app,`http://test/api/rooms/${roomId}/generate`,'POST',{}, { Cookie: cA });
    await req(app,`http://test/api/rooms/${roomId}/status`,'POST',{ status:'REVIEW' }, { Cookie: cA });
    await req(app,`http://test/api/rooms/${roomId}/status`,'POST',{ status:'PUBLISHED' }, { Cookie: cA });
    await req(app,`http://test/api/rooms/${roomId}/status`,'POST',{ status:'ACTIVE' }, { Cookie: cA });
    r = await req(app,'http://test/api/auth/register','POST',{ nick:'ub12', email:'ub12@ex.com', senha:'senha12345' });
    const cU = (r.headers.get('Set-Cookie')||'').split(';')[0];
    // duas chamadas simultâneas ao start
    const [a, b] = await Promise.all([
      req(app,`http://test/api/rooms/${roomId}/start`,'POST',{}, { Cookie: cU }),
      req(app,`http://test/api/rooms/${roomId}/start`,'POST',{}, { Cookie: cU })
    ]);
    const sts = [a.status, b.status].sort((x,y)=>x-y);
    expect(sts[0]).toBe(201);              // uma cria a tentativa
    expect([200, 409]).toContain(sts[1]);  // a outra retoma (200) ou é bloqueada (409) — nunca 500
    // exatamente uma tentativa no banco
    const db:any = (global as any).__DB;
    const cnt:any = await db.prepare('SELECT COUNT(*) as c FROM attempts WHERE user_id = (SELECT id FROM users WHERE nick = ?)').bind('ub12').first();
    expect(Number(cnt.c)).toBe(1);
    // terceira chamada (já em andamento) também não duplica: retoma sem 201
    const c3 = await req(app,`http://test/api/rooms/${roomId}/start`,'POST',{}, { Cookie: cU });
    expect([200, 409]).toContain(c3.status);
  });

  it('start bloqueia se sala não ACTIVE', async () => {
    let r = await req(app,'http://test/api/auth/register','POST',{ nick:'a1', email:'a1@ex.com', senha:'senha12345' });
    const cA = (r.headers.get('Set-Cookie')||'').split(';')[0];
    r = await req(app,'http://test/api/rooms','POST',{ nome:'Draft', assuntos:['X'], quantidade:10, tempo_por_questao:30 }, { Cookie: cA });
    const id = (await r.json() as any).room.id;
    // tenta start em DRAFT
    let r2 = await req(app,'http://test/api/auth/register','POST',{ nick:'u1', email:'u1@ex.com', senha:'senha12345' });
    const cU = (r2.headers.get('Set-Cookie')||'').split(';')[0];
    r2 = await req(app,`http://test/api/rooms/${id}/start`,'POST',{}, { Cookie: cU });
    expect(r2.status).toBe(409);
  });

  it('servidor calcula pontuação, não confia no cliente', async () => {
    let r = await req(app,'http://test/api/auth/register','POST',{ nick:'adm2', email:'adm2@ex.com', senha:'senha12345' });
    const cA = (r.headers.get('Set-Cookie')||'').split(';')[0];
    r = await req(app,'http://test/api/rooms','POST',{ nome:'Score', assuntos:['Y'], quantidade:10, tempo_por_questao:30 }, { Cookie: cA });
    const id = (await r.json() as any).room.id;
    await req(app,`http://test/api/rooms/${id}/generate`,'POST',{}, { Cookie: cA });
    await req(app,`http://test/api/rooms/${id}/status`,'POST',{ status:'REVIEW' }, { Cookie: cA });
    await req(app,`http://test/api/rooms/${id}/status`,'POST',{ status:'PUBLISHED' }, { Cookie: cA });
    await req(app,`http://test/api/rooms/${id}/status`,'POST',{ status:'ACTIVE' }, { Cookie: cA });
    r = await req(app,'http://test/api/auth/register','POST',{ nick:'usr2', email:'usr2@ex.com', senha:'senha12345' });
    const cU = (r.headers.get('Set-Cookie')||'').split(';')[0];
    r = await req(app,`http://test/api/rooms/${id}/start`,'POST',{}, { Cookie: cU });
    const qs = (await r.json() as any).questoes;
    // responde 2 corretas
    const adminQs = await (await req(app,`http://test/api/rooms/${id}/questions`,'GET',undefined,{ Cookie: cA })).json() as any;
    for (let i=0;i<2;i++) {
      const qid = qs[i].id;
      const gab = adminQs.questoes.find((x:any)=>x.id===qid).correta_idx;
      await req(app,`http://test/api/rooms/${id}/answer`,'POST',{ question_id:qid, alternativa_idx:gab, tempo_gasto:2 }, { Cookie: cU });
    }
    // finish - cliente tenta enviar pontuacao fake (não tem campo, mas verifica que servidor ignora)
    r = await req(app,`http://test/api/rooms/${id}/finish`,'POST',{ pontuacao: 999999 }, { Cookie: cU });
    const j:any = await r.json();
    expect(j.resultado.pontuacao).toBeLessThan(500); // 2*120=240, não 999999
    expect(j.resultado.acertos).toBe(2);
  });
});
