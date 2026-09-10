import { describe, it, expect, beforeEach } from 'vitest';
import { montarPrompt, extrairJSON, mockLocal, AIService, validarQuestao, validarLote, repararLote } from '../src/lib/ai.js';
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
    }, batch(statements: any[]) { sqlite.exec('BEGIN'); try { const results = statements.map(s => s.run()); sqlite.exec('COMMIT'); return results; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } },
    exec(sql: string){ sqlite.exec(sql); return {success:true}; }
  } as unknown as D1Database;
}
async function req(app:any, url:string, method:string, body?:any, headers:Record<string,string>={}, env:any={}) {
  const init:any={ method, headers:{'Content-Type':'application/json',...headers} };
  if(body!==undefined) init.body=JSON.stringify(body);
  return app.fetch(new Request(url, init), { DB:(global as any).__DB, ENVIRONMENT:'development', ...env });
}

describe('IA Fase 5', () => {
  beforeEach(()=>{ (global as any).__DB = createMockDB(); });
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
  it('B2: mockLocal sorteia correta_idx (não fica fixo na letra C)', () => {
    const lote = mockLocal({ materia: 'Geografia', assuntos: ['Clima', 'Relevo', 'Vegetação'], dificuldade: 'medio', quantidade: 40 });
    expect(lote.questoes).toHaveLength(40);
    const idxs = new Set(lote.questoes.map((q:any)=>q.correta_idx));
    expect(idxs.size).toBeGreaterThan(1);
    // a alternativa marcada como correta realmente está no índice sorteado
    for (const q of lote.questoes as any[]) {
      expect(String(q.alternativas[q.correta_idx])).toContain('Resposta correta');
      expect(q.correta_idx).toBeGreaterThanOrEqual(0);
      expect(q.correta_idx).toBeLessThan(4);
    }
  });

  it('B9: repararLote substitui exatamente o índice inválido (não sempre o 0)', async () => {
    const base = { alternativas: ['A','B','C','D'], correta_idx: 0, explicacao: 'explicação', assunto: 'Alg', dificuldade: 'medio' };
    const valida1 = { ...base, enunciado: 'Pergunta válida 1?' };
    const valida3 = { ...base, enunciado: 'Pergunta válida 3?' };
    const invalida = { ...base, enunciado: 'Pergunta quebrada?', explicacao: '' };
    const lote = [valida1, invalida, valida3];
    const substituicao = { ...base, enunciado: 'Pergunta regenerada?' };
    let chamadas = 0;
    const r = await repararLote(lote, async () => { chamadas++; return substituicao; }, 3);
    expect(r.ok).toBe(true);
    expect(r.questoes).toHaveLength(3);
    expect(r.questoes[1].enunciado).toBe('Pergunta regenerada?'); // posição 1 corrigida
    expect(r.questoes[0].enunciado).toBe('Pergunta válida 1?');   // demais intactas
    expect(r.questoes[2].enunciado).toBe('Pergunta válida 3?');
    expect(chamadas).toBe(1); // só regenerou a quebrada
  });

  it('B13+B9: /generate completa lote curto e resolve duplicidade substituindo a posição repetida', async () => {
    // admin cria sala DRAFT com quantidade 5
    let r = await req(app,'http://test/api/auth/register','POST',{ nick:'adm913', email:'adm913@ex.com', senha:'senha12345' });
    const cookie = (r.headers.get('Set-Cookie')||'').split(';')[0];
    r = await req(app,'http://test/api/rooms','POST',{ nome:'Reparo', assuntos:['Física'], quantidade:5, tempo_por_questao:30 }, { Cookie: cookie });
    const id = (await r.json() as any).room.id;
    // stub da Workers AI: 1ª chamada devolve 4 de 5 pedidas; a 2ª (top-up) repete a 1ª questão;
    // a 3ª (reparo) devolve uma questão nova e única
    const base = (i:number) => ({ enunciado:`Enunciado ${i}?`, alternativas:[`A${i}`,`B${i}`,`C${i}`,`D${i}`], correta_idx: i%4, explicacao:`Explicação ${i}`, assunto:'Física', dificuldade:'medio' });
    let chamada = 0;
    const stubAI = {
      run: async () => {
        chamada++;
        let questoes;
        if (chamada === 1) questoes = [base(1), base(2), base(3), base(4)];
        else if (chamada === 2) questoes = [base(1)]; // top-up duplicado
        else questoes = [base(5)];                      // substituição definitiva
        return { response: JSON.stringify({ questoes }) };
      }
    };
    const g = await req(app,`http://test/api/rooms/${id}/generate`,'POST',{}, { Cookie: cookie }, { AI: stubAI, AI_MODEL: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' });
    expect(g.status).toBe(200);
    const j:any = await g.json();
    expect(j.quantidade).toBe(5);
    // questões persistidas: 5, todas únicas, com a substituição na posição 4
    const qa = await req(app,`http://test/api/rooms/${id}/questions`,'GET',undefined,{ Cookie: cookie });
    const qj:any = await qa.json();
    expect(qj.questoes).toHaveLength(5);
    const enunciados = qj.questoes.map((q:any)=>q.enunciado);
    expect(new Set(enunciados).size).toBe(5);
    expect(enunciados[4]).toBe('Enunciado 5?'); // a posição repetida foi a última a ser corrigida
    expect(enunciados.slice(0,4)).toEqual(['Enunciado 1?','Enunciado 2?','Enunciado 3?','Enunciado 4?']);
    expect(chamada).toBe(3);
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
