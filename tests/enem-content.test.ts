import { it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { gerarSQL } from '../scripts/seed-enem.mjs';
import { salasAplicacao } from '../content/enem-aplicacao.mjs';

it('importa seis simulados completos, sem duplicar ou modificar registros anteriores', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  for(const f of fs.readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort()) db.exec(fs.readFileSync('migrations/'+f,'utf8'));
  db.exec("INSERT INTO rooms(id,nome,codigo) VALUES ('anterior','Sala preservada','ABC123')");
  const sql = gerarSQL();
  expect(fs.readFileSync('content/enem-2026.sql','utf8').replaceAll('\r\n','\n')).toBe(sql);
  db.exec(sql); db.exec(sql);
  expect(db.prepare("SELECT count(*) n FROM rooms WHERE id LIKE 'nivora_enem_v1_%' AND status='ACTIVE' AND tempo_por_questao=0 AND codigo IS NULL").get()?.n).toBe(6);
  expect(db.prepare("SELECT count(*) n FROM questions WHERE room_id LIKE 'nivora_enem_v1_%'").get()?.n).toBe(30);
  expect(db.prepare("SELECT count(*) n FROM question_options WHERE question_id LIKE 'nivora_enem_v1_%'").get()?.n).toBe(150);
  expect(db.prepare("SELECT nome,codigo FROM rooms WHERE id='anterior'").get()).toEqual({nome:'Sala preservada',codigo:'ABC123'});
  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  expect(db.prepare("SELECT q.id FROM questions q LEFT JOIN question_options o ON o.question_id=q.id AND o.ordem=q.correta_idx WHERE q.room_id LIKE 'nivora_enem_v1_%' AND o.id IS NULL").all()).toEqual([]);
  const second=gerarSQL(salasAplicacao,'nivora_enem_v2_');
  expect(fs.readFileSync('content/enem-aplicacao.sql','utf8').replaceAll('\r\n','\n')).toBe(second);
  db.exec(second);db.exec(second);
  expect(db.prepare("SELECT count(*) n FROM rooms WHERE id LIKE 'nivora_enem_v%'").get()?.n).toBe(12);
  expect(db.prepare("SELECT count(*) n FROM questions WHERE room_id LIKE 'nivora_enem_v%'").get()?.n).toBe(60);
  expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
  db.close();
});
