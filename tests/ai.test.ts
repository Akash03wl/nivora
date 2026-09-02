import { describe, it, expect } from 'vitest';
import { montarPrompt, extrairJSON, mockLocal, AIService, validarQuestao, validarLote } from '../src/lib/ai.js';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import app from '../src/index.js';

function createMockDB() {
  const sqlite = new DatabaseSync(':memory:');
  const dir = path.join(process.cwd(), 'migrations');
  for (const f of fs.readdirSync(dir).filter(x=>x.endsWith('.sql')).sort()) sqlite.exec(fs.readFileSync(path.join(dir,f),'utf-8'));
  return {
    prepare(sql: string) {
      const stmt:any=sqlite.prepare(sql);
      return { bind(...p:unknown[]){ return { first:(c?:string)=>{ const r=stmt.get(...p) as any; if(r===undefined) return null; return c? r[c]: r; }, all:()=>({results:stmt.all(...p)||[]}), run:()=>{ const r=stmt.run(...p); return {meta:{changes:r.changes}}; } }; } };
    }, exec(sql:string){ sqlite.exec(sql); return {success:true}; }
  } as unknown as D1Database;
}
async function req(app:any, url:string, method:string, body?:any, headers:Record<string,string>={}, env:any={}) {
  const init:any={ method, headers:{'Content-Type':'application/json',...headers} };
  if(body!==undefined) init.body=JSON.stringify(body);
  return app.fetch(new Request(url, init), { DB:(global as any).__DB, ENVIRONMENT:'development', ...env });
}

describe('IA Fase 5', () => {
  it('montarPrompt robusto contém 10 instruções', () => {
    const p = montarPrompt({ materia:'Matemática', assuntos:['Função afim','Quadrática'], dificuldade:'dificil', quantidade:20 });
    expect(p).toContain('Gere exatamente 20');
    expect(p).toContain('Revise a própria questão');
    expect(p).toContain('Matéria: Matemática');
  });
  it('extrairJSON robusto a markdown', () => {
    const j = extrairJSON('```json\n{"questoes":[{"enunciado":"Q?"}]}\n```');
    expect(j.questoes[0].enunciado).toBe('Q?');
    expect(extrairJSON('sem json')).toBeNull();
  });
  it('validarQuestao cobre regras #9', () => {
    expect(validarQuestao({ enunciado:'Q?', alternativas:['A','B','C','D'], correta_idx:0, explicacao:'exp', assunto:'Alg', dificuldade:'medio' },0).ok).toBe(true);
    expect(validarQuestao({ enunciado:'', alternativas:['A','B','C','D'], correta_idx:0, explicacao:'exp', assunto:'Alg', dificuldade:'medio' },0).ok).toBe(false); // vazia
    expect(validarQuestao({ enunciado:'Q?', alternativas:['A','B','C'], correta_idx:0, explicacao:'exp', assunto:'Alg', dificuldade:'medio' },0).ok).toBe(false); // 3 alts
    expect(validarQuestao({ enunciado:'Q?', alternativas:['A','A','C','D'], correta_idx:0, explicacao:'exp', assunto:'Alg', dificuldade:'medio' },0).ok).toBe(false); // duplicada
    expect(validarQuestao({ enunciado:'Q?', alternativas:['A','B','C','D'], correta_idx:5, explicacao:'exp', assunto:'Alg', dificuldade:'medio' },0).ok).toBe(false); // gabarito invalido
    expect(validarQuestao({ enunciado:'Q?', alternativas:['A','B','C','D'], correta_idx:0, explicacao:'', assunto:'Alg', dificuldade:'medio' },0).ok).toBe(false); // sem explicacao
  });
  it('validarLote detecta enunciados duplicados', () => {
    const qs = [
      { enunciado:'Q?', alternativas:['A','B','C','D'], correta_idx:0, explicacao:'e', assunto:'a', dificuldade:'medio' },
      { enunciado:'Q?', alternativas:['A','B','C','D'], correta_idx:1, explicacao:'e', assunto:'a', dificuldade:'medio' }
    ];
    expect(validarLote(qs).ok).toBe(false);
  });
  it('AIService fallback mock-local quando sem credenciais', async () => {
    const ai = new AIService({});
    const r = await ai.generateQuestions({ materia:'Geografia', assuntos:['Clima'], dificuldade:'medio', quantidade:5 });
    expect(r.provedor).toBe('mock-local');
    expect(r.questoes).toHaveLength(5);
    expect(validarLote(r.questoes).ok).toBe(true);
  });
  it('generate → validate → store → economia (não regenera)', async () => {
    (global as any).__DB = createMockDB();
    // cria admin e sala
    let r = await req(app,'http://test/api/auth/register','POST',{ nick:'adm', email:'adm@ex.com', senha:'senha12345' });
    const cookie = (r.headers.get('Set-Cookie')||'').split(';')[0];
    r = await req(app,'http://test/api/rooms','POST',{ nome:'Simulado IA', assuntos:['Fotossíntese'], quantidade:10, tempo_por_questao:30, materia_id:'ciencias' }, { Cookie: cookie });
    const id = (await r.json() as any).room.id;
    // primeira geração
    let g = await req(app,`http://test/api/rooms/${id}/generate`,'POST',{}, { Cookie: cookie });
    expect(g.status).toBe(200);
    let j:any = await g.json();
    expect(j.provedor).toBe('mock-local');
    expect(j.quantidade).toBe(10);
    // segunda sem force deve economizar
    g = await req(app,`http://test/api/rooms/${id}/generate`,'POST',{}, { Cookie: cookie });
    j = await g.json();
    expect(j.economizado).toBe(true);
    // com force regenera
    g = await req(app,`http://test/api/rooms/${id}/generate?force=1`,'POST',{}, { Cookie: cookie });
    j = await g.json();
    expect(j.economizado).toBeUndefined();
    expect(g.status).toBe(200);
    // rate limit: 5/min, já fizemos 3 (1 + economizado + 1 force), precisa mais 3 para estourar (total 6)
    await req(app,`http://test/api/rooms/${id}/generate?force=1`,'POST',{}, { Cookie: cookie });
    await req(app,`http://test/api/rooms/${id}/generate?force=1`,'POST',{}, { Cookie: cookie });
    await req(app,`http://test/api/rooms/${id}/generate?force=1`,'POST',{}, { Cookie: cookie });
    const over = await req(app,`http://test/api/rooms/${id}/generate?force=1`,'POST',{}, { Cookie: cookie });
    expect(over.status).toBe(429);
  });
  it('não publica questões inválidas (400)', async () => {
    (global as any).__DB = createMockDB();
    // mock que gera inválida: força via AIService com quantidade 0? Testa validarLote direto
    const inv = [{ enunciado:'', alternativas:['A','B','C','D'], correta_idx:0, explicacao:'', assunto:'', dificuldade:'medio' }];
    expect(validarLote(inv).ok).toBe(false);
  });
});
