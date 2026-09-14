import { describe, it, expect, beforeEach } from 'vitest';
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
async function criaAtiva(cookie:string) {
  let r = await req(app,'http://test/api/rooms','POST',{ nome:'Hist Test', assuntos:['Fotossíntese','Ecologia'], quantidade:10, tempo_por_questao:30, materia_id:'ciencias' }, { Cookie: cookie });
  const id = (await r.json() as any).room.id;
  await req(app,`http://test/api/rooms/${id}/generate`,'POST',{}, { Cookie: cookie });
  await req(app,`http://test/api/rooms/${id}/status`,'POST',{ status:'REVIEW' }, { Cookie: cookie });
  await req(app,`http://test/api/rooms/${id}/status`,'POST',{ status:'PUBLISHED' }, { Cookie: cookie });
  await req(app,`http://test/api/rooms/${id}/status`,'POST',{ status:'ACTIVE' }, { Cookie: cookie });
  return id;
}

describe('Histórico Fase 8', () => {
  beforeEach(()=>{ (global as any).__DB = mockDB(); });

  it('painel de reforço isola usuários e só libera revisão depois da conclusão', async () => {
    const db=(global as any).__DB;
    db.exec(fs.readFileSync('content/enem-2026.sql','utf8'));
    expect((await req(app,'http://test/api/me/study','GET')).status).toBe(401);
    const a=await req(app,'http://test/api/auth/register','POST',{nick:'study-a',email:'study-a@example.test',senha:'TesteEstudo2026!'});
    const cookie=(a.headers.get('Set-Cookie')||'').split(';')[0];
    const base='http://test/api/rooms/nivora_enem_v1_matematica';
    await req(app,base+'/start','POST',{}, {Cookie:cookie});
    let panel:any=await (await req(app,'http://test/api/me/study','GET',undefined,{Cookie:cookie})).json();
    expect(panel.ongoing).toHaveLength(1);expect(panel.review).toHaveLength(0);
    await req(app,base+'/finish','POST',{}, {Cookie:cookie});
    panel=await (await req(app,'http://test/api/me/study','GET',undefined,{Cookie:cookie})).json();
    expect(panel.ongoing).toHaveLength(0);expect(panel.review).toHaveLength(5);
    expect(panel.review[0].alternativas).toHaveLength(5);
    expect(panel.review[0].explicacao.length).toBeGreaterThan(10);
    const b=await req(app,'http://test/api/auth/register','POST',{nick:'study-b',email:'study-b@example.test',senha:'TesteEstudo2026!'});
    const other=(b.headers.get('Set-Cookie')||'').split(';')[0];
    const isolated:any=await (await req(app,'http://test/api/me/study','GET',undefined,{Cookie:other})).json();
    expect(isolated.review).toEqual([]);expect(isolated.completed).toEqual([]);
  });

  it('history e stats refletem tentativas e por assunto/materia', async () => {
    let r = await req(app,'http://test/api/auth/register','POST',{ nick:'adm', email:'adm@ex.com', senha:'senha12345' });
    const cA = (r.headers.get('Set-Cookie')||'').split(';')[0];
    const roomId = await criaAtiva(cA);
    r = await req(app,'http://test/api/auth/register','POST',{ nick:'aluno', email:'aluno@ex.com', senha:'senha12345' });
    const cU = (r.headers.get('Set-Cookie')||'').split(';')[0];
    // start → responde 3 de 10 (assuntos variam: Fotossíntese/Ecologia)
    let qs = (await (await req(app,`http://test/api/rooms/${roomId}/start`,'POST',{}, { Cookie: cU })).json() as any).questoes;
    const gab = (await (await req(app,`http://test/api/rooms/${roomId}/questions`,'GET',undefined,{ Cookie: cA })).json() as any).questoes;
    for (let i=0;i<3;i++) {
      await req(app,`http://test/api/rooms/${roomId}/answer`,'POST',{ question_id:qs[i].id, alternativa_idx: gab.find((x:any)=>x.id===qs[i].id).correta_idx, tempo_gasto:2 }, { Cookie: cU });
    }
    for (let i=3;i<5;i++) {
      const err = (gab.find((x:any)=>x.id===qs[i].id).correta_idx + 1) % 4;
      await req(app,`http://test/api/rooms/${roomId}/answer`,'POST',{ question_id:qs[i].id, alternativa_idx:err, tempo_gasto:2 }, { Cookie: cU });
    }
    await req(app,`http://test/api/rooms/${roomId}/finish`,'POST',{}, { Cookie: cU });

    // history
    const h = await req(app,'http://test/api/me/history','GET',undefined,{ Cookie: cU });
    expect(h.status).toBe(200);
    const hj:any = await h.json();
    expect(hj.history).toHaveLength(1);
    expect(hj.history[0].acertos).toBe(3);
    expect(hj.history[0].total).toBe(10);
    expect(hj.history[0].porcentagem).toBe(30);
    expect(hj.history[0].posicao).toBe(1);

    // stats
    const s = await req(app,'http://test/api/me/stats','GET',undefined,{ Cookie: cU });
    expect(s.status).toBe(200);
    const sj:any = await s.json();
    expect(sj.totalSimulados).toBe(1);
    expect(sj.questoesRespondidas).toBe(10); // attempts conta total (inclui não respondidas como erro)
    // mas attempts total é 10, acertos 3, então taxa sobre answers = 60%? Por assunto deve refletir answers
    expect(sj.porMateria['ciencias']).toBeDefined();
    expect(sj.porAssunto).toBeDefined();
    // porAssunto deve ter Fotossíntese e Ecologia com taxas
    const chaves = Object.keys(sj.porAssunto);
    expect(chaves.length).toBeGreaterThan(0);
  });

  it('historico vazio retorna lista vazia', async () => {
    let r = await req(app,'http://test/api/auth/register','POST',{ nick:'novo', email:'novo@ex.com', senha:'senha12345' });
    const c = (r.headers.get('Set-Cookie')||'').split(';')[0];
    const h = await req(app,'http://test/api/me/history','GET',undefined,{ Cookie: c });
    const j:any = await h.json();
    expect(j.history).toHaveLength(0);
    const s = await req(app,'http://test/api/me/stats','GET',undefined,{ Cookie: c });
    const sj:any = await s.json();
    expect(sj.totalSimulados).toBe(0);
    expect(sj.taxaAcerto).toBe(0);
  });
});
