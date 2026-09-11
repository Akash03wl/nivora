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
async function req(app:any, url:string, method:string, body?:any, headers:Record<string,string>={}) {
  const init:any={ method, headers:{'Content-Type':'application/json',...headers} };
  if(body!==undefined) init.body=JSON.stringify(body);
  return app.fetch(new Request(url, init), { DB:(global as any).__DB, ENVIRONMENT:'development' });
}

describe('Fase 11 — Integração ponta-a-ponta (fluxo mestre)', () => {
  beforeEach(()=>{ (global as any).__DB = mockDB(); });

  it('ADMIN cria → IA gera → publica → ALUNO faz simulado → ranking + historico', async () => {
    // 1. ADMIN cria conta (primeiro vira ADMIN)
    let r = await req(app,'http://test/api/auth/register','POST',{ nick:'admin', email:'admin@ex.com', senha:'senha12345' });
    expect(r.status).toBe(201);
    const cAdmin = (r.headers.get('Set-Cookie')||'').split(';')[0];
    let j:any = await r.json();
    expect(j.usuario.papel).toBe('ADMIN');

    // 2. Cria simulado
    r = await req(app,'http://test/api/rooms','POST',{ nome:'Matemática Avançada', descricao:'Simulado completo', materia_id:'matematica', assuntos:['Função afim','Quadrática'], quantidade:10, dificuldade:'medio', tempo_por_questao:30 }, { Cookie: cAdmin });
    expect(r.status).toBe(201);
    const roomId = (await r.json() as any).room.id;

    // 3. IA gera
    r = await req(app,`http://test/api/rooms/${roomId}/generate`,'POST',{}, { Cookie: cAdmin });
    expect(r.status).toBe(200);
    j = await r.json();
    expect(j.quantidade).toBe(10);
    expect(j.provedor).toBeDefined();

    // 4. Publica: REVIEW → PUBLISHED → ACTIVE
    r = await req(app,`http://test/api/rooms/${roomId}/status`,'POST',{ status:'REVIEW' }, { Cookie: cAdmin });
    expect(r.status).toBe(200);
    r = await req(app,`http://test/api/rooms/${roomId}/status`,'POST',{ status:'PUBLISHED' }, { Cookie: cAdmin });
    expect(r.status).toBe(200);
    expect((await r.json() as any).room.codigo).toBeTruthy();
    r = await req(app,`http://test/api/rooms/${roomId}/status`,'POST',{ status:'ACTIVE' }, { Cookie: cAdmin });
    expect(r.status).toBe(200);

    // 5. ALUNO cria conta
    r = await req(app,'http://test/api/auth/register','POST',{ nick:'aluno', email:'aluno@ex.com', senha:'senha12345' });
    expect(r.status).toBe(201);
    const cAluno = (r.headers.get('Set-Cookie')||'').split(';')[0];
    j = await r.json();
    expect(j.usuario.papel).toBe('USER');

    // 6. Visualiza salas
    r = await req(app,'http://test/api/rooms','GET',undefined,{ Cookie: cAluno });
    j = await r.json();
    expect(j.rooms.some((x:any)=>x.id===roomId)).toBe(true);

    // 7. Inicia simulado (sem gabarito)
    r = await req(app,`http://test/api/rooms/${roomId}/start`,'POST',{}, { Cookie: cAluno });
    expect(r.status).toBe(201);
    j = await r.json();
    expect(j.questoes).toHaveLength(10);
    expect(j.questoes[0].correta_idx).toBeUndefined();

    // 8. Responde (pega gabarito via admin para simular acertos)
    const gab = (await (await req(app,`http://test/api/rooms/${roomId}/questions`,'GET',undefined,{ Cookie: cAdmin })).json() as any).questoes;
    for (let i=0;i<7;i++) {
      await req(app,`http://test/api/rooms/${roomId}/answer`,'POST',{ question_id:j.questoes[i].id, alternativa_idx: gab.find((x:any)=>x.id===j.questoes[i].id).correta_idx, tempo_gasto:3 }, { Cookie: cAluno });
    }
    for (let i=7;i<10;i++) {
      const err = (gab.find((x:any)=>x.id===j.questoes[i].id).correta_idx + 1) % 4;
      await req(app,`http://test/api/rooms/${roomId}/answer`,'POST',{ question_id:j.questoes[i].id, alternativa_idx:err, tempo_gasto:5 }, { Cookie: cAluno });
    }

    // 9. Finaliza (servidor corrige)
    r = await req(app,`http://test/api/rooms/${roomId}/finish`,'POST',{}, { Cookie: cAluno });
    expect(r.status).toBe(200);
    j = await r.json();
    expect(j.resultado.acertos).toBe(7);
    expect(j.resultado.total).toBe(10);
    expect(j.resultado.aproveitamento).toBe(70);
    expect(j.resultado.pontuacao).toBeGreaterThan(700); // 7*100 + bônus
    expect(j.gabarito).toHaveLength(10);
    expect(j.resultado.posicao).toBe(1);

    // 10. Ranking por sala
    r = await req(app,`http://test/api/rooms/${roomId}/ranking`,'GET',undefined,{ Cookie: cAluno });
    j = await r.json();
    expect(j.ranking[0].nick).toBe('aluno');
    expect(j.ranking[0].acertos).toBe(7);

    // 11. Histórico e estatísticas
    r = await req(app,'http://test/api/me/history','GET',undefined,{ Cookie: cAluno });
    j = await r.json();
    expect(j.history[0].acertos).toBe(7);
    expect(j.history[0].porcentagem).toBe(70);
    r = await req(app,'http://test/api/me/stats','GET',undefined,{ Cookie: cAluno });
    j = await r.json();
    expect(j.totalSimulados).toBe(1);
    expect(j.taxaAcerto).toBe(70);
    expect(j.porMateria['matematica']).toBeDefined();

    // 12. Proteções: USER não cria sala
    r = await req(app,'http://test/api/rooms','POST',{ nome:'Hack', assuntos:['X'], quantidade:10, tempo_por_questao:30 }, { Cookie: cAluno });
    expect(r.status).toBe(403);

    // 13. Cliente não define pontuação
    r = await req(app,`http://test/api/rooms/${roomId}/finish`,'POST',{ pontuacao:999999 }, { Cookie: cAluno });
    j = await r.json();
    expect(j.ja_finalizada).toBe(true); // já finalizada, não aceita nova pontuação
  });
});
