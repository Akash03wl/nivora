import { Hono } from 'hono';
import { usuarioDaSessao, ehAdmin } from '../lib/auth.js';
import { primeira, todas, executar, novoId } from '../lib/db.js';
import { STATUS, LIMITES } from '../lib/config.js';

type Env = { DB: D1Database; ENVIRONMENT: string };

const VALOR_STATUS = Object.values(STATUS);
const TRANSICOES: Record<string, string[]> = {
  DRAFT: ['REVIEW', 'ARCHIVED'],
  REVIEW: ['DRAFT', 'PUBLISHED', 'ARCHIVED'],
  PUBLISHED: ['ACTIVE', 'CLOSED', 'ARCHIVED'],
  ACTIVE: ['CLOSED', 'ARCHIVED'],
  CLOSED: ['ACTIVE', 'ARCHIVED'],
  ARCHIVED: []
};

function gerarCodigo(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

export const rooms = new Hono<{ Bindings: Env }>();

// Helper: exige admin
async function exigirAdmin(c: any) {
  const user = await usuarioDaSessao(c.env.DB, c.req.raw);
  if (!user) return { erro: c.json({ erro: 'Não autenticado.' }, 401) };
  if (!ehAdmin(user)) return { erro: c.json({ erro: 'Acesso restrito a administradores.' }, 403) };
  return { user };
}

// POST /api/rooms — criar (ADMIN)
rooms.post('/', async (c) => {
  const chk = await exigirAdmin(c);
  if ('erro' in chk) return chk.erro;
  const user: any = chk.user;
  let body: any = {};
  try { body = await c.req.json(); } catch {}
  const nome = String(body.nome || body.titulo || '').trim();
  if (nome.length < 3 || nome.length > LIMITES.MAX_TITULO) return c.json({ erro: 'Nome deve ter 3-80 caracteres.' }, 400);
  const descricao = String(body.descricao || '').trim().slice(0, LIMITES.MAX_DESCRICAO);
  const materia_id = body.materia_id ? String(body.materia_id).trim() : null;
  if (materia_id) {
    const m = await primeira(c.env.DB, 'SELECT id FROM subjects WHERE id = ?', materia_id);
    if (!m) return c.json({ erro: 'Matéria não encontrada.' }, 400);
  }
  const assuntos = Array.isArray(body.assuntos) ? body.assuntos.map((s: any)=>String(s).trim()).filter(Boolean).slice(0, LIMITES.MAX_ASSUNTOS) : [];
  if (!assuntos.length) return c.json({ erro: 'Informe pelo menos um assunto.' }, 400);
  const quantidade = Number(body.quantidade) || 10;
  if (![10,20,30,40,50].includes(quantidade) && (quantidade < LIMITES.MIN_QUESTOES || quantidade > LIMITES.MAX_QUESTOES)) return c.json({ erro: 'Quantidade inválida.' }, 400);
  const dificuldade = String(body.dificuldade || 'medio');
  if (!['facil','medio','dificil','muito_dificil','personalizado'].includes(dificuldade)) return c.json({ erro: 'Dificuldade inválida.' }, 400);
  const tempo = Number(body.tempo_por_questao ?? 30);
  if (![0,15,30,45,60,120].includes(tempo)) return c.json({ erro: 'Tempo por questão inválido.' }, 400);

  const id = 'r_' + novoId('');
  await executar(c.env.DB,
    'INSERT INTO rooms (id, nome, descricao, materia_id, assuntos, quantidade, dificuldade, tempo_por_questao, status, criador_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id, nome, descricao, materia_id, JSON.stringify(assuntos), quantidade, dificuldade, tempo, STATUS.DRAFT, user.id
  );
  await executar(c.env.DB, 'INSERT INTO admin_logs (id, user_id, acao, alvo_tipo, alvo_id, detalhes) VALUES (?, ?, ?, ?, ?, ?)', novoId('log_'), user.id, 'criar_sala', 'rooms', id, JSON.stringify({ nome }));
  const room = await primeira(c.env.DB, 'SELECT * FROM rooms WHERE id = ?', id);
  return c.json({ room: { ...room, assuntos: JSON.parse((room as any).assuntos) } }, 201);
});

// GET /api/rooms — listar
rooms.get('/', async (c) => {
  const status = c.req.query('status');
  const q = c.req.query('q');
  let sql = 'SELECT * FROM rooms WHERE 1=1';
  const params: unknown[] = [];
  const user = await usuarioDaSessao(c.env.DB, c.req.raw);
  const isAdm = !!user && ehAdmin(user);
  // usuários comuns só veem PUBLISHED/ACTIVE/CLOSED; admin vê tudo ou filtra por status
  if (status && (VALOR_STATUS as readonly string[]).includes(status)) {
    sql += ' AND status = ?'; params.push(status);
  } else if (!isAdm) {
    sql += " AND status IN ('PUBLISHED','ACTIVE','CLOSED')";
  }
  if (q) { sql += ' AND (nome LIKE ? OR descricao LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY atualizado_em DESC LIMIT 100';
  const lista = await todas(c.env.DB, sql, ...params);
  const out = lista.map((r:any)=>({ ...r, assuntos: JSON.parse(r.assuntos || '[]') }));
  return c.json({ rooms: out });
});

// GET /api/rooms/:id
rooms.get('/:id', async (c) => {
  const id = c.req.param('id');
  const room: any = await primeira(c.env.DB, 'SELECT * FROM rooms WHERE id = ?', id);
  if (!room) return c.json({ erro: 'Sala não encontrada.' }, 404);
  const user = await usuarioDaSessao(c.env.DB, c.req.raw);
  const isAdm = !!user && ehAdmin(user);
  // protege rascunho: só admin ou criador vê DRAFT/REVIEW/ARCHIVED
  if ([STATUS.DRAFT, STATUS.REVIEW, STATUS.ARCHIVED].includes(room.status) && !isAdm) {
    // também permite criador ver seu rascunho
    if (!user || user.id !== room.criador_id) return c.json({ erro: 'Sala não disponível.' }, 404);
  }
  return c.json({ room: { ...room, assuntos: JSON.parse(room.assuntos || '[]') } });
});

// PATCH /api/rooms/:id — editar (ADMIN)
rooms.patch('/:id', async (c) => {
  const chk = await exigirAdmin(c);
  if ('erro' in chk) return chk.erro;
  const id = c.req.param('id');
  const room: any = await primeira(c.env.DB, 'SELECT * FROM rooms WHERE id = ?', id);
  if (!room) return c.json({ erro: 'Sala não encontrada.' }, 404);
  if ([STATUS.ACTIVE].includes(room.status)) return c.json({ erro: 'Não é possível editar sala ativa. Feche primeiro.' }, 409);
  let body: any = {};
  try { body = await c.req.json(); } catch {}
  const sets: string[] = [];
  const params: unknown[] = [];
  if (body.nome !== undefined) {
    const n = String(body.nome).trim();
    if (n.length < 3 || n.length > LIMITES.MAX_TITULO) return c.json({ erro: 'Nome inválido.' }, 400);
    sets.push('nome = ?'); params.push(n);
  }
  if (body.descricao !== undefined) { sets.push('descricao = ?'); params.push(String(body.descricao).trim().slice(0, LIMITES.MAX_DESCRICAO)); }
  if (body.assuntos !== undefined) {
    const a = Array.isArray(body.assuntos) ? body.assuntos.map((s:any)=>String(s).trim()).filter(Boolean).slice(0, LIMITES.MAX_ASSUNTOS) : [];
    if (!a.length) return c.json({ erro: 'Assuntos inválidos.' }, 400);
    sets.push('assuntos = ?'); params.push(JSON.stringify(a));
  }
  if (body.dificuldade !== undefined) {
    if (!['facil','medio','dificil','muito_dificil','personalizado'].includes(String(body.dificuldade))) return c.json({ erro: 'Dificuldade inválida.' }, 400);
    sets.push('dificuldade = ?'); params.push(String(body.dificuldade));
  }
  if (body.tempo_por_questao !== undefined) {
    const t = Number(body.tempo_por_questao);
    if (![0,15,30,45,60,120].includes(t)) return c.json({ erro: 'Tempo inválido.' }, 400);
    sets.push('tempo_por_questao = ?'); params.push(t);
  }
  if (!sets.length) return c.json({ erro: 'Nada para atualizar.' }, 400);
  sets.push('atualizado_em = ?'); params.push(new Date().toISOString());
  params.push(id);
  await executar(c.env.DB, `UPDATE rooms SET ${sets.join(', ')} WHERE id = ?`, ...params);
  await executar(c.env.DB, 'INSERT INTO admin_logs (id, user_id, acao, alvo_tipo, alvo_id, detalhes) VALUES (?, ?, ?, ?, ?, ?)', novoId('log_'), (chk.user as any).id, 'editar_sala', 'rooms', id, JSON.stringify(body));
  const novo: any = await primeira(c.env.DB, 'SELECT * FROM rooms WHERE id = ?', id);
  return c.json({ room: { ...novo, assuntos: JSON.parse(novo.assuntos || '[]') } });
});

// DELETE /api/rooms/:id — (ADMIN)
rooms.delete('/:id', async (c) => {
  const chk = await exigirAdmin(c);
  if ('erro' in chk) return chk.erro;
  const id = c.req.param('id');
  const room = await primeira(c.env.DB, 'SELECT id, status FROM rooms WHERE id = ?', id);
  if (!room) return c.json({ erro: 'Sala não encontrada.' }, 404);
  if ((room as any).status === STATUS.ACTIVE) return c.json({ erro: 'Feche a sala antes de excluir.' }, 409);
  await executar(c.env.DB, 'DELETE FROM rooms WHERE id = ?', id);
  await executar(c.env.DB, 'INSERT INTO admin_logs (id, user_id, acao, alvo_tipo, alvo_id) VALUES (?, ?, ?, ?, ?)', novoId('log_'), (chk.user as any).id, 'excluir_sala', 'rooms', id);
  return c.json({ ok: true });
});

// POST /api/rooms/:id/status — transição de estado (ADMIN)
rooms.post('/:id/status', async (c) => {
  const chk = await exigirAdmin(c);
  if ('erro' in chk) return chk.erro;
  const id = c.req.param('id');
  let body: any = {};
  try { body = await c.req.json(); } catch {}
  const novo = String(body.status || '').toUpperCase();
  if (!(VALOR_STATUS as readonly string[]).includes(novo)) return c.json({ erro: 'Status inválido.' }, 400);
  const room: any = await primeira(c.env.DB, 'SELECT * FROM rooms WHERE id = ?', id);
  if (!room) return c.json({ erro: 'Sala não encontrada.' }, 404);
  const atual = room.status;
  if (atual === novo) return c.json({ room: { ...room, assuntos: JSON.parse(room.assuntos||'[]') } });
  const permitidos = TRANSICOES[atual] || [];
  if (!permitidos.includes(novo)) return c.json({ erro: `Transição ${atual} → ${novo} não permitida. Permitidas: ${permitidos.join(', ') || 'nenhuma'}` }, 409);

  let codigo = room.codigo;
  // gera código ao publicar/ativar se ainda não tem
  if (!codigo && (novo === STATUS.PUBLISHED || novo === STATUS.ACTIVE)) {
    for (let i=0;i<5;i++) {
      const cand = gerarCodigo();
      const existe = await primeira(c.env.DB, 'SELECT id FROM rooms WHERE codigo = ?', cand);
      if (!existe) { codigo = cand; break; }
    }
  }
  const sets = ['status = ?', 'atualizado_em = ?'];
  const params: unknown[] = [novo, new Date().toISOString()];
  if (codigo && codigo !== room.codigo) { sets.push('codigo = ?'); params.push(codigo); }
  params.push(id);
  await executar(c.env.DB, `UPDATE rooms SET ${sets.join(', ')} WHERE id = ?`, ...params);
  await executar(c.env.DB, 'INSERT INTO admin_logs (id, user_id, acao, alvo_tipo, alvo_id, detalhes) VALUES (?, ?, ?, ?, ?, ?)', novoId('log_'), (chk.user as any).id, 'alterar_status', 'rooms', id, JSON.stringify({ de: atual, para: novo }));
  const atualizada: any = await primeira(c.env.DB, 'SELECT * FROM rooms WHERE id = ?', id);
  return c.json({ room: { ...atualizada, assuntos: JSON.parse(atualizada.assuntos||'[]') } });
});
