import { describe, it, expect, beforeEach } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

function createDB() {
  const sqlite = new DatabaseSync(':memory:');
  const dir = path.join(process.cwd(), 'migrations');
  for (const f of fs.readdirSync(dir).filter(x=>x.endsWith('.sql')).sort()) {
    sqlite.exec(fs.readFileSync(path.join(dir,f),'utf-8'));
  }
  return sqlite;
}

describe('DB Schema Fase 3', () => {
  let db: any;
  beforeEach(()=>{ db = createDB(); });

  it('todas as tabelas esperadas existem', () => {
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    const names = rows.map((r:any)=>r.name);
    for (const t of ['users','rooms','questions','question_options','attempts','answers','scores','subjects','ai_generations','admin_logs','sessions','rate_limit','password_resets']) {
      expect(names).toContain(t);
    }
  });

  it('relacionamentos e UNIQUE funcionam', () => {
    db.prepare("INSERT INTO users (id, nick, email, senha_hash) VALUES ('u1','ana','ana@ex.com','hash')").run();
    db.prepare("INSERT INTO subjects (id, nome, slug) VALUES ('mat','Matemática','mat')").run();
    db.prepare("INSERT INTO rooms (id, nome, materia_id, assuntos, quantidade, dificuldade, status) VALUES ('r1','Simulado','mat','[\"a\"]',10,'medio','DRAFT')").run();
    db.prepare("INSERT INTO questions (id, room_id, enunciado, correta_idx) VALUES ('q1','r1','Enunciado?',0)").run();
    db.prepare("INSERT INTO question_options (id, question_id, texto, ordem) VALUES ('o1','q1','A',0)").run();
    db.prepare("INSERT INTO question_options (id, question_id, texto, ordem) VALUES ('o2','q1','B',1)").run();
    // attempts UNIQUE(user,room)
    db.prepare("INSERT INTO attempts (id, user_id, room_id) VALUES ('at1','u1','r1')").run();
    expect(()=>db.prepare("INSERT INTO attempts (id, user_id, room_id) VALUES ('at2','u1','r1')").run()).toThrow();
    // answers UNIQUE(attempt,question)
    db.prepare("INSERT INTO answers (id, attempt_id, question_id, alternativa_idx, correta) VALUES ('a1','at1','q1',0,1)").run();
    expect(()=>db.prepare("INSERT INTO answers (id, attempt_id, question_id) VALUES ('a2','at1','q1')").run()).toThrow();
    // CASCADE: deletar room deleta questions
    db.prepare("DELETE FROM rooms WHERE id='r1'").run();
    const q = db.prepare("SELECT COUNT(*) as c FROM questions WHERE id='q1'").get() as any;
    expect(q.c).toBe(0);
  });

  it('índices existem', () => {
    const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map((r:any)=>r.name);
    expect(idx).toContain('idx_rooms_status');
    expect(idx).toContain('idx_attempts_user');
    expect(idx).toContain('idx_scores_pontuacao');
  });

  it('seeds de subjects', () => {
    const rows = db.prepare("SELECT slug FROM subjects ORDER BY slug").all() as any[];
    const slugs = rows.map(r=>r.slug);
    expect(slugs).toContain('matematica');
    expect(slugs).toContain('geral');
    expect(slugs.length).toBeGreaterThanOrEqual(6);
  });

  it('migrations são reaplicáveis (IF NOT EXISTS)', () => {
    // Reaplicar criações (CREATE TABLE/INDEX IF NOT EXISTS) e seeds (INSERT OR IGNORE) não deve quebrar.
    // Exceção documentada: 0006_faseB é um ALTER TABLE ADD COLUMN — SQLite não aceita IF NOT EXISTS
    // nesse comando, então ele é aplicado uma única vez (D1 controla migrations aplicadas).
    const dir = path.join(process.cwd(), 'migrations');
    for (const f of fs.readdirSync(dir).filter(x=>x.endsWith('.sql') && !x.includes('0006')).sort()) {
      db.exec(fs.readFileSync(path.join(dir,f),'utf-8'));
    }
    const c = db.prepare("SELECT COUNT(*) as c FROM subjects").get() as any;
    expect(c.c).toBeGreaterThanOrEqual(6);
    // 0006 aplicado no beforeEach: coluna existe exatamente uma vez e com o tipo certo
    const cols = db.prepare('PRAGMA table_info(attempts)').all() as any[];
    const col = cols.filter((r:any)=>r.name==='ultima_resposta_em');
    expect(col).toHaveLength(1);
    expect(col[0].type).toBe('TEXT');
  });
});
