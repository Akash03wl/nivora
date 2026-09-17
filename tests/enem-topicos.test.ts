import {it,expect} from 'vitest';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {blocos,montarSalas} from '../content/enem-topicos.mjs';
import {salasEnem} from '../content/enem-2026.mjs';
import {salasAplicacao} from '../content/enem-aplicacao.mjs';
import {gerarSQL} from '../scripts/seed-enem.mjs';

it('valida 24 assuntos e 120 itens sem repetição de enunciados, com cinco alternativas únicas',()=>{
  const salas=montarSalas();
  expect(salas).toHaveLength(24);
  expect(new Set(salas.map(s=>s.id)).size).toBe(24);
  expect(new Set(blocos.map(s=>s.assunto)).size).toBe(24);
  const texts=new Set<string>();
  for(const s of [...salasEnem,...salasAplicacao,...salas]) {
    expect(s.questoes).toHaveLength(5);
    for(const q of s.questoes){
      const normalized=q.enunciado.normalize('NFC').toLowerCase().trim();
      expect(texts.has(normalized)).toBe(false);texts.add(normalized);
      expect(q.alternativas).toHaveLength(5);expect(new Set(q.alternativas).size).toBe(5);
      expect(q.correta_idx).toBeGreaterThanOrEqual(0);expect(q.correta_idx).toBeLessThan(5);
      expect(q.explicacao.length).toBeGreaterThan(0);
    }
  }
  expect(texts.size).toBe(180);
  salas.forEach((s,n)=>s.questoes.forEach((q:any,i:number)=>{
    expect(q.explicacao.length).toBeGreaterThan(30);
    expect(q.alternativas[q.correta_idx]).toBe(blocos[n].itens[i][1]);
  }));
});

it('importa o catálogo completo duas vezes sem duplicação e preserva os dados anteriores',()=>{
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
  for(const f of fs.readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())db.exec(fs.readFileSync('migrations/'+f,'utf8'));
  db.exec(fs.readFileSync('content/enem-2026.sql','utf8'));
  db.exec(fs.readFileSync('content/enem-aplicacao.sql','utf8'));
  const before=db.prepare("SELECT * FROM questions WHERE room_id LIKE 'nivora_enem_v1_%'").all();
  const sql=gerarSQL(montarSalas(),'nivora_enem_v3_');
  expect(fs.readFileSync('content/enem-topicos.sql','utf8').replaceAll('\r\n','\n')).toBe(sql);
  db.exec(sql);db.exec(sql);
  expect(db.prepare("SELECT count(*) n FROM rooms WHERE id LIKE 'nivora_enem_v%' AND status='ACTIVE'").get()?.n).toBe(36);
  expect(db.prepare("SELECT count(*) n FROM questions WHERE room_id LIKE 'nivora_enem_v%'").get()?.n).toBe(180);
  expect(db.prepare("SELECT count(*) n FROM question_options WHERE question_id LIKE 'nivora_enem_v%'").get()?.n).toBe(900);
  expect(db.prepare("SELECT * FROM questions WHERE room_id LIKE 'nivora_enem_v1_%'").all()).toEqual(before);
  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);db.close();
});

it('confere cálculos do lote de modo independente dos índices das alternativas',()=>{
  const answer=(id:string,i:number)=>blocos.find(b=>b.id===id)!.itens[i][1];
  const money=(v:number)=>`R$ ${Math.round(v*100)/100}`;
  expect(answer('porcentagem',0)).toBe(money(320*(1-.15)));
  expect(answer('porcentagem',2)).toBe(money(144/.8));
  expect(answer('porcentagem',3)).toBe(money(100*1.1*.9));
  expect(answer('porcentagem',4)).toBe(String(240*.35));
  expect(answer('funcao_afim',1)).toBe(`${500-20*12} L`);
  expect(answer('funcao_afim',2)).toBe(`${(30-10)/(.4-.2)} páginas`);
  expect(answer('funcao_afim',3)).toBe(String((16-7)/(5-2)));
  expect(answer('funcao_afim',4)).toBe(`${Math.floor(200/(9-5))+1} unidades`);
  expect(answer('estatistica',0)).toBe(`${(10+12+14+14+20)/5} minutos`);
  expect(answer('estatistica',1)).toBe(money((1800+2200)/2));
  expect(answer('geometria_plana',0)).toBe(`${2*(7+4)} m`);
  expect(answer('geometria_plana',1)).toBe(`${12*5/2} m²`);
  expect(answer('geometria_plana',2)).toBe(`${3*3**2} m²`);
  expect(answer('geometria_plana',3)).toBe(`${Math.sqrt(5**2-3**2)} m`);
  expect(answer('razao_proporcao',0)).toBe(`${3*8/6} horas`);
  expect(answer('razao_proporcao',1)).toBe(`${300/(180/15)} L`);
  expect(answer('razao_proporcao',2)).toBe(money(600*3/5));
  expect(answer('cinematica',0)).toBe(`${90/1.5} km/h`);
  expect(answer('cinematica',1)).toBe(`${72/3.6} m/s`);
  expect(answer('cinematica',2)).toBe(`${2*6} m/s`);
  expect(answer('cinematica',3)).toBe(`${5*40} m`);
  expect(answer('calorimetria',0)).toBe(`${8400/(200*4.2)} °C`);
  expect(answer('calorimetria',3)).toBe(`${(20+60)/2} °C`);
  expect(answer('eletricidade',1)).toBe(`${4+6} Ω`);
  expect(answer('eletricidade',2)).toBe(`${1/(1/8+1/8)} Ω`);
  expect(answer('eletricidade',3)).toBe(`${120*2} W`);
  expect(answer('ondulatoria',0)).toBe(`${50*2} m/s`);
  expect(answer('ondulatoria',3)).toBe(`${340*.4/2} m`);
  expect(answer('solucoes',0)).toBe(`${15/.3} g/L`);
  expect(answer('estequiometria',0)).toBe(`${6/2} mol`);
  expect(answer('estequiometria',1)).toBe(`${6/12*44} g`);
  expect(answer('estequiometria',2)).toBe(`${60/80*100}%`);
  expect(answer('estequiometria',4)).toBe(`${50*.8} g`);
  expect(answer('cartografia',1)).toBe(`${25000/100} m`);
});
