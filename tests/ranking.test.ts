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

async function criaSalaAtivaComQuestoes(cookieAdmin:string) {
  let r = await req(app,'http://test/api/rooms','POST',{ nome:'Ranking Test', assuntos:['Clima'], quantidade:10, tempo_por_questao:60, materia_id:'geografia' }, { Cookie: cookieAdmin });
  const id = (await r.json() as any).room.id;
  await req(app,`http://test/api/rooms/${id}/generate`,'POST',{}, { Cookie: cookieAdmin });
  await req(app,`http://test/api/rooms/${id}/status`,'POST',{ status:'REVIEW' }, { Cookie: cookieAdmin });
  await req(app,`http://test/api/rooms/${id}/status`,'POST',{ status:'PUBLISHED' }, { Cookie: cookieAdmin });
  await req(app,`http://test/api/rooms/${id}/status`,'POST',{ status:'ACTIVE' }, { Cookie: cookieAdmin });
  return id;
}

describe('Ranking Fase 7', () => {
  beforeEach(()=>{ (global as any).__DB = mockDB(); });
  afterEach(()=>{ vi.useRealTimers(); });

  it('ranking ordena por acertos > pontuacao > tempo', async () => {
    // B8: o tempo é medido pelo servidor — o teste avança o relógio fake para simular ritmo real
    vi.useFakeTimers({ now: new Date('2026-01-01T00:00:00.000Z') });
    let r = await req(app,'http://test/api/auth/register','POST',{ nick:'adm', email:'adm@ex.com', senha:'senha12345' });
    const cA = (r.headers.get('Set-Cookie')||'').split(';')[0];
    const roomId = await criaSalaAtivaComQuestoes(cA);

    // pega gabarito
    const qs = (await (await req(app,`http://test/api/rooms/${roomId}/questions`,'GET',undefined,{ Cookie: cA })).json() as any).questoes;
    // cria 3 alunos com diferentes desempenhos
    const alunos: any[] = [];
    for (const nick of ['ana','bob','carlos']) {
      const rr = await req(app,'http://test/api/auth/register','POST',{ nick, email:`${nick}@ex.com`, senha:'senha12345' });
      alunos.push({ nick, cookie: (rr.headers.get('Set-Cookie')||'').split(';')[0] });
    }
    // ana: 10 acertos rápidos (2s por questão → bônus máximo; servidor mede o tempo)
    let ru = alunos[0];
    await req(app,`http://test/api/rooms/${roomId}/start`,'POST',{}, { Cookie: ru.cookie });
    for (const q of qs) {
      vi.advanceTimersByTime(2000);
      await req(app,`http://test/api/rooms/${roomId}/answer`,'POST',{ question_id:q.id, alternativa_idx:q.correta_idx }, { Cookie: ru.cookie });
    }
    await req(app,`http://test/api/rooms/${roomId}/finish`,'POST',{}, { Cookie: ru.cookie });

    // bob: 5 acertos lentos (20s por questão na primeira metade — mesmo 5 acertos que carlos, porém mais lento e com menos bônus)
    ru = alunos[1];
    await req(app,`http://test/api/rooms/${roomId}/start`,'POST',{}, { Cookie: ru.cookie });
    for (let i=0;i<5;i++) {
      vi.advanceTimersByTime(20000);
      await req(app,`http://test/api/rooms/${roomId}/answer`,'POST',{ question_id:qs[i].id, alternativa_idx:qs[i].correta_idx }, { Cookie: ru.cookie });
    }
    for (let i=5;i<10;i++) {
      vi.advanceTimersByTime(5000);
      const err = (qs[i].correta_idx + 1) % 4;
      await req(app,`http://test/api/rooms/${roomId}/answer`,'POST',{ question_id:qs[i].id, alternativa_idx:err }, { Cookie: ru.cookie });
    }
    await req(app,`http://test/api/rooms/${roomId}/finish`,'POST',{}, { Cookie: ru.cookie });

    // carlos: 5 acertos rápidos (2s por questão — deve ficar na frente de bob por pontuação e tempo)
    ru = alunos[2];
    await req(app,`http://test/api/rooms/${roomId}/start`,'POST',{}, { Cookie: ru.cookie });
    for (let i=0;i<5;i++) {
      vi.advanceTimersByTime(2000);
      await req(app,`http://test/api/rooms/${roomId}/answer`,'POST',{ question_id:qs[i].id, alternativa_idx:qs[i].correta_idx }, { Cookie: ru.cookie });
    }
    for (let i=5;i<10;i++) {
      vi.advanceTimersByTime(2000);
      const err = (qs[i].correta_idx + 1) % 4;
      await req(app,`http://test/api/rooms/${roomId}/answer`,'POST',{ question_id:qs[i].id, alternativa_idx:err }, { Cookie: ru.cookie });
    }
    await req(app,`http://test/api/rooms/${roomId}/finish`,'POST',{}, { Cookie: ru.cookie });

    // ranking
    const rk = await req(app,`http://test/api/rooms/${roomId}/ranking`,'GET',undefined,{ Cookie: cA });
    expect(rk.status).toBe(200);
    const j:any = await rk.json();
    expect(j.ranking).toHaveLength(3);
    // 1º deve ser ana (10 acertos)
    expect(j.ranking[0].nick).toBe('ana');
    expect(j.ranking[0].acertos).toBe(10);
    // 2º carlos (5 acertos rápido) deve ficar na frente de bob (5 acertos lento) por pontuacao
    expect(j.ranking[1].nick).toBe('carlos');
    expect(j.ranking[2].nick).toBe('bob');
    // verifica que mais acertos nunca perde para menos acertos mesmo com bonus
    expect(j.ranking[0].acertos).toBeGreaterThan(j.ranking[1].acertos);
  });

  it('resultado detalhado por questao', async () => {
    let r = await req(app,'http://test/api/auth/register','POST',{ nick:'adm2', email:'adm2@ex.com', senha:'senha12345' });
    const cA = (r.headers.get('Set-Cookie')||'').split(';')[0];
    const roomId = await criaSalaAtivaComQuestoes(cA);
    r = await req(app,'http://test/api/auth/register','POST',{ nick:'aluno', email:'aluno2@ex.com', senha:'senha12345' });
    const cU = (r.headers.get('Set-Cookie')||'').split(';')[0];
    let qs = (await (await req(app,`http://test/api/rooms/${roomId}/start`,'POST',{}, { Cookie: cU })).json() as any).questoes;
    const gab = (await (await req(app,`http://test/api/rooms/${roomId}/questions`,'GET',undefined,{ Cookie: cA })).json() as any).questoes;
    // acerta 1, erra 1
    await req(app,`http://test/api/rooms/${roomId}/answer`,'POST',{ question_id:qs[0].id, alternativa_idx:gab.find((x:any)=>x.id===qs[0].id).correta_idx, tempo_gasto:2 }, { Cookie: cU });
    const err = (gab.find((x:any)=>x.id===qs[1].id).correta_idx + 1) % 4;
    await req(app,`http://test/api/rooms/${roomId}/answer`,'POST',{ question_id:qs[1].id, alternativa_idx:err, tempo_gasto:2 }, { Cookie: cU });
    await req(app,`http://test/api/rooms/${roomId}/finish`,'POST',{}, { Cookie: cU });
    const res = await req(app,`http://test/api/rooms/${roomId}/result`,'GET',undefined,{ Cookie: cU });
    expect(res.status).toBe(200);
    const j:any = await res.json();
    expect(j.resultado.acertos).toBe(1);
    expect(j.porQuestao).toHaveLength(10);
    expect(j.porQuestao[0].acertou).toBe(true);
    expect(j.porQuestao[0].explicacao).toBeDefined();
    expect(j.porQuestao[1].acertou).toBe(false);
    // não respondidas devem ter acertou false
    expect(j.porQuestao[2].sua_resposta).toBeNull();
  });

  it('cliente não pode definir pontuacao arbitraria', async () => {
    let r = await req(app,'http://test/api/auth/register','POST',{ nick:'adm3', email:'adm3@ex.com', senha:'senha12345' });
    const cA = (r.headers.get('Set-Cookie')||'').split(';')[0];
    const roomId = await criaSalaAtivaComQuestoes(cA);
    r = await req(app,'http://test/api/auth/register','POST',{ nick:'cheater', email:'cheater@ex.com', senha:'senha12345' });
    const cU = (r.headers.get('Set-Cookie')||'').split(';')[0];
    await req(app,`http://test/api/rooms/${roomId}/start`,'POST',{}, { Cookie: cU });
    const qs = (await (await req(app,`http://test/api/rooms/${roomId}/questions`,'GET',undefined,{ Cookie: cA })).json() as any).questoes;
    // tenta enviar pontuacao fake no finish (campo ignorado)
    await req(app,`http://test/api/rooms/${roomId}/answer`,'POST',{ question_id:qs[0].id, alternativa_idx:qs[0].correta_idx, tempo_gasto:2 }, { Cookie: cU });
    const fin = await req(app,`http://test/api/rooms/${roomId}/finish`,'POST',{ pontuacao:999999, acertos:10 }, { Cookie: cU });
    const j:any = await fin.json();
    expect(j.resultado.pontuacao).toBeLessThan(200); // 1 acerto ~120, não 999999
    expect(j.resultado.acertos).toBe(1);
  });
});
