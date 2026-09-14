import { writeFileSync } from 'node:fs';
import { salasEnem } from '../content/enem-2026.mjs';

const str = value => `'${String(value).replaceAll("'", "''")}'`;
export function gerarSQL(salas = salasEnem, prefix = 'nivora_enem_v1_') {
  const lines = ['-- Gerado por scripts/seed-enem.mjs. Apenas inclusões; não altera tentativas ou conteúdo existente.'];
  const nomes = { portugues:'Português', matematica:'Matemática', biologia:'Biologia', fisica:'Física', quimica:'Química', humanas:'Ciências Humanas' };
  for (const sala of salas) {
    const id = `${prefix}${sala.id}`;
    if (sala.questoes.length !== 5) throw new Error('Quantidade inesperada');
    lines.push(`INSERT INTO subjects (id,nome,slug) VALUES (${str(sala.materia)},${str(nomes[sala.materia])},${str(sala.materia)}) ON CONFLICT(id) DO NOTHING;`);
    lines.push(`INSERT INTO rooms (id,nome,descricao,materia_id,assuntos,quantidade,dificuldade,tempo_por_questao,status) VALUES (${str(id)},${str('Simulado de '+sala.nome)},${str('Preparação ENEM · 5 questões autorais de fundamentos, com explicações. Sem cronômetro. Não é prova oficial nem simulação da nota TRI.')},${str(sala.materia)},${str(JSON.stringify(sala.questoes.map(q=>q.assunto)))},5,'medio',0,'ACTIVE') ON CONFLICT(id) DO NOTHING;`);
    sala.questoes.forEach((q,i) => {
      if(q.alternativas.length !== 5 || new Set(q.alternativas).size !== 5 || !Number.isInteger(q.correta_idx) || q.correta_idx < 0 || q.correta_idx > 4 || !q.explicacao) throw new Error('Questão inválida');
      const qid = `${id}_q${i+1}`;
      lines.push(`INSERT INTO questions (id,room_id,enunciado,explicacao,assunto,ordem,correta_idx) VALUES (${str(qid)},${str(id)},${str(q.enunciado)},${str(q.explicacao)},${str(q.assunto)},${i},${q.correta_idx}) ON CONFLICT(id) DO NOTHING;`);
      q.alternativas.forEach((a,j)=>lines.push(`INSERT INTO question_options (id,question_id,texto,ordem) VALUES (${str(qid+'_o'+j)},${str(qid)},${str(a)},${j}) ON CONFLICT(id) DO NOTHING;`));
    });
  }
  return lines.join('\n')+'\n';
}
if (process.argv[1]?.replaceAll('\\','/').endsWith('/seed-enem.mjs')) {
  writeFileSync(new URL('../content/enem-2026.sql', import.meta.url), gerarSQL());
  console.log('Conteúdo ENEM validado e SQL gerado: 6 salas, 30 questões, 150 alternativas.');
}
