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

describe('Segurança Fase 9', () => {
  beforeEach(()=>{ (global as any).__DB = mockDB(); });

  it('XSS em nick é sanitizado', async () => {
    const r = await req(app,'http://test/api/auth/register','POST',{ nick:'<script>alert(1)</script>', email:'xss@ex.com', senha:'senha12345' });
    expect(r.status).toBe(201);
    const j:any = await r.json();
    expect(j.usuario.nick).not.toContain('<');
    expect(j.usuario.nick).not.toContain('>');
  });

  it('SQL injection em email não bypassa', async () => {
    await req(app,'http://test/api/auth/register','POST',{ nick:'bob', email:'bob@ex.com', senha:'senha12345' });
    const r = await req(app,'http://test/api/auth/login','POST',{ email:"' OR '1'='1", senha:'senha12345' });
    expect(r.status).toBe(400); // email inválido, não 200
  });

  it('USER não acessa ADMIN', async () => {
    let r = await req(app,'http://test/api/auth/register','POST',{ nick:'adm', email:'adm@ex.com', senha:'senha12345' });
    const cA = (r.headers.get('Set-Cookie')||'').split(';')[0];
    r = await req(app,'http://test/api/auth/register','POST',{ nick:'usr', email:'usr@ex.com', senha:'senha12345' });
    const cU = (r.headers.get('Set-Cookie')||'').split(';')[0];
    // criar sala como ADMIN ok
    r = await req(app,'http://test/api/rooms','POST',{ nome:'Teste', assuntos:['X'], quantidade:10, tempo_por_questao:30 }, { Cookie: cA });
    expect(r.status).toBe(201);
    // criar como USER deve falhar 403
    r = await req(app,'http://test/api/rooms','POST',{ nome:'Hack', assuntos:['X'], quantidade:10, tempo_por_questao:30 }, { Cookie: cU });
    expect(r.status).toBe(403);
  });

  it('gabarito não exposto antes de finish', async () => {
    let r = await req(app,'http://test/api/auth/register','POST',{ nick:'adm2', email:'adm2@ex.com', senha:'senha12345' });
    const cA = (r.headers.get('Set-Cookie')||'').split(';')[0];
    r = await req(app,'http://test/api/rooms','POST',{ nome:'Gabarito', assuntos:['Y'], quantidade:10, tempo_por_questao:30 }, { Cookie: cA });
    const id = (await r.json() as any).room.id;
    await req(app,`http://test/api/rooms/${id}/generate`,'POST',{}, { Cookie: cA });
    await req(app,`http://test/api/rooms/${id}/status`,'POST',{ status:'REVIEW' }, { Cookie: cA });
    await req(app,`http://test/api/rooms/${id}/status`,'POST',{ status:'PUBLISHED' }, { Cookie: cA });
    await req(app,`http://test/api/rooms/${id}/status`,'POST',{ status:'ACTIVE' }, { Cookie: cA });
    r = await req(app,'http://test/api/auth/register','POST',{ nick:'aluno', email:'aluno@ex.com', senha:'senha12345' });
    const cU = (r.headers.get('Set-Cookie')||'').split(';')[0];
    // start
    const start = await req(app,`http://test/api/rooms/${id}/start`,'POST',{}, { Cookie: cU });
    const qs:any = (await start.json()).questoes;
    expect(qs[0].correta_idx).toBeUndefined();
    // questions endpoint como USER em ACTIVE não deve expor correta_idx
    const q = await req(app,`http://test/api/rooms/${id}/questions`,'GET',undefined,{ Cookie: cU });
    const j:any = await q.json();
    expect(j.questoes[0].correta_idx).toBeUndefined();
    // admin vê
    const qa = await req(app,`http://test/api/rooms/${id}/questions`,'GET',undefined,{ Cookie: cA });
    const ja:any = await qa.json();
    expect(ja.questoes[0].correta_idx).toBeDefined();
  });

  it('B4: sala PUBLISHED não expõe gabarito (correta_idx) para comum nem anônimo', async () => {
    // admin cria, gera questões e avança até PUBLISHED (ainda não ativa)
    let r = await req(app,'http://test/api/auth/register','POST',{ nick:'admb4', email:'admb4@ex.com', senha:'senha12345' });
    const cA = (r.headers.get('Set-Cookie')||'').split(';')[0];
    r = await req(app,'http://test/api/rooms','POST',{ nome:'Publicada', assuntos:['Y'], quantidade:10, tempo_por_questao:30 }, { Cookie: cA });
    const id = (await r.json() as any).room.id;
    await req(app,`http://test/api/rooms/${id}/generate`,'POST',{}, { Cookie: cA });
    await req(app,`http://test/api/rooms/${id}/status`,'POST',{ status:'REVIEW' }, { Cookie: cA });
    await req(app,`http://test/api/rooms/${id}/status`,'POST',{ status:'PUBLISHED' }, { Cookie: cA });

    // visitante anônimo (nem logado) não deve ver o gabarito
    const anon = await req(app,`http://test/api/rooms/${id}/questions`,'GET');
    expect(anon.status).toBe(200);
    const ja:any = await anon.json();
    expect(ja.questoes.length).toBeGreaterThan(0);
    expect(ja.questoes[0].correta_idx).toBeUndefined();
    expect(ja.questoes[0].explicacao).toBeUndefined();

    // usuário comum também não vê
    r = await req(app,'http://test/api/auth/register','POST',{ nick:'alunob4', email:'alunob4@ex.com', senha:'senha12345' });
    const cU = (r.headers.get('Set-Cookie')||'').split(';')[0];
    const usr = await req(app,`http://test/api/rooms/${id}/questions`,'GET',undefined,{ Cookie: cU });
    const ju:any = await usr.json();
    expect(ju.questoes[0].correta_idx).toBeUndefined();
    expect(ju.questoes[0].explicacao).toBeUndefined();

    // admin vê o gabarito completo
    const adm = await req(app,`http://test/api/rooms/${id}/questions`,'GET',undefined,{ Cookie: cA });
    const jadm:any = await adm.json();
    expect(jadm.questoes[0].correta_idx).toBeDefined();
    expect(jadm.questoes[0].explicacao).toBeDefined();
  });

  it('B10: alternativa_idx 4 (fora do range) é resposta inválida, não "normal" incorreta', async () => {
    let r = await req(app,'http://test/api/auth/register','POST',{ nick:'admb10', email:'admb10@ex.com', senha:'senha12345' });
    const cA = (r.headers.get('Set-Cookie')||'').split(';')[0];
    r = await req(app,'http://test/api/rooms','POST',{ nome:'Range', assuntos:['Z'], quantidade:10, tempo_por_questao:30 }, { Cookie: cA });
    const id = (await r.json() as any).room.id;
    await req(app,`http://test/api/rooms/${id}/generate`,'POST',{}, { Cookie: cA });
    await req(app,`http://test/api/rooms/${id}/status`,'POST',{ status:'REVIEW' }, { Cookie: cA });
    await req(app,`http://test/api/rooms/${id}/status`,'POST',{ status:'PUBLISHED' }, { Cookie: cA });
    await req(app,`http://test/api/rooms/${id}/status`,'POST',{ status:'ACTIVE' }, { Cookie: cA });
    r = await req(app,'http://test/api/auth/register','POST',{ nick:'userb10', email:'userb10@ex.com', senha:'senha12345' });
    const cU = (r.headers.get('Set-Cookie')||'').split(';')[0];
    const start = await req(app,`http://test/api/rooms/${id}/start`,'POST',{}, { Cookie: cU });
    const q1 = (await start.json() as any).questoes[0];
    // envia alternativa 4 (inexistente — só existem 0..3)
    const ans = await req(app,`http://test/api/rooms/${id}/answer`,'POST',{ question_id:q1.id, alternativa_idx:4 }, { Cookie: cU });
    expect(ans.status).toBe(200);
    const ar:any = await ans.json();
    expect(ar.correta).toBe(false);
    await req(app,`http://test/api/rooms/${id}/finish`,'POST',{}, { Cookie: cU });
    const res = await req(app,`http://test/api/rooms/${id}/result`,'GET',undefined,{ Cookie: cU });
    const jr:any = await res.json();
    const pq = jr.porQuestao.find((x:any)=>x.question_id===q1.id);
    // valor inválido não é gravado como resposta legítima → consta como não respondida
    expect(pq.sua_resposta).toBeNull();
    expect(pq.acertou).toBe(false);
    expect(jr.resultado.acertos).toBe(0);
  });

  it('rate limit em rooms create e answer', async () => {
    let r = await req(app,'http://test/api/auth/register','POST',{ nick:'adm3', email:'adm3@ex.com', senha:'senha12345' });
    const cA = (r.headers.get('Set-Cookie')||'').split(';')[0];
    // cria 10 salas rápido (limite 10/min) -> 11ª deve bloquear
    for (let i=0;i<10;i++) await req(app,'http://test/api/rooms','POST',{ nome:`Sala ${i}`, assuntos:['X'], quantidade:10, tempo_por_questao:30 }, { Cookie: cA });
    const over = await req(app,'http://test/api/rooms','POST',{ nome:'Over', assuntos:['X'], quantidade:10, tempo_por_questao:30 }, { Cookie: cA });
    expect(over.status).toBe(429);
  });

  it('senha nunca exposta', async () => {
    let r = await req(app,'http://test/api/auth/register','POST',{ nick:'sec', email:'sec@ex.com', senha:'senha12345' });
    const j:any = await r.json();
    expect(j.usuario.senha_hash).toBeUndefined();
    expect(JSON.stringify(j)).not.toContain('senha12345');
    // login também não expõe
    r = await req(app,'http://test/api/auth/login','POST',{ email:'sec@ex.com', senha:'senha12345' });
    const jl:any = await r.json();
    expect(jl.usuario.senha_hash).toBeUndefined();
  });
});
