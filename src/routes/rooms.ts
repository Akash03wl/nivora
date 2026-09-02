import { Hono } from 'hono';
import { usuarioDaSessao, ehAdmin } from '../lib/auth.js';
import { primeira, todas, executar, novoId } from '../lib/db.js';
import { STATUS, LIMITES } from '../lib/config.js';
import { AIService, validarLote } from '../lib/ai.js';
import { checar } from '../lib/rateLimit.js';

type Env = { DB: D1Database; ENVIRONMENT: string; AI?: any; AI_MODEL?: string; AI_API_KEY?: string; AI_BASE_URL?: string };

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

// POST /api/rooms/:id/generate — IA gera questões (ADMIN)
rooms.post('/:id/generate', async (c) => {
  const chk = await exigirAdmin(c);
  if ('erro' in chk) return chk.erro;
  const user: any = chk.user;
  const id = c.req.param('id');
  const room: any = await primeira(c.env.DB, 'SELECT * FROM rooms WHERE id = ?', id);
  if (!room) return c.json({ erro: 'Sala não encontrada.' }, 404);
  if (![STATUS.DRAFT, STATUS.REVIEW].includes(room.status)) return c.json({ erro: `Só é possível gerar em DRAFT/REVIEW (atual: ${room.status}).` }, 409);

  // Economia: se já tem questões validadas, não regenera sem ?force=1
  const jaTem = await primeira<{ c: number }>(c.env.DB, 'SELECT COUNT(*) as c FROM questions WHERE room_id = ?', id);
  const force = c.req.query('force') === '1';
  if (jaTem && jaTem.c > 0 && !force) {
    const qs = await todas(c.env.DB, 'SELECT * FROM questions WHERE room_id = ? ORDER BY ordem', id);
    const comOpts = await Promise.all(qs.map(async (q: any) => {
      const opts = await todas(c.env.DB, 'SELECT texto FROM question_options WHERE question_id = ? ORDER BY ordem', q.id);
      return { ...q, alternativas: opts.map((o: any) => o.texto) };
    }));
    return c.json({ ok: true, economizado: true, mensagem: 'Questões já existem. Use ?force=1 para regenerar.', questoes: comOpts, provedor: 'cache' });
  }

  // Rate limit IA: 5/min por admin
  const lim = await checar(c.env.DB, c.req.raw, 'ia-generate', 5, 60);
  if (!lim.ok) return c.json({ erro: 'Muitas gerações. Aguarde.' }, 429);

  let materiaNome = 'Geral';
  if (room.materia_id) {
    const m: any = await primeira(c.env.DB, 'SELECT nome FROM subjects WHERE id = ?', room.materia_id);
    if (m) materiaNome = m.nome;
  }
  const assuntos = JSON.parse(room.assuntos || '[]') as string[];
  const quantidade = Number(room.quantidade) || 10;
  const dificuldade = String(room.dificuldade || 'medio');

  const ai = new AIService(c.env);
  let resultado: any;
  try {
    resultado = await ai.generateQuestions({ materia: materiaNome, assuntos, dificuldade, quantidade });
  } catch (e: any) {
    await executar(c.env.DB, 'INSERT INTO ai_generations (id, room_id, provedor, modelo, prompt, resposta_raw, status) VALUES (?, ?, ?, ?, ?, ?, ?)', novoId('ai_'), id, 'erro', String(c.env.AI_MODEL || ''), '', String(e?.message || e), 'falha');
    return c.json({ erro: 'Falha na IA. Tente novamente.' }, 502);
  }

  // Validação de schema + conteúdo
  const valid = validarLote(resultado.questoes);
  if (!valid.ok) {
    // tenta regenerar até 3 vezes (economia limitada)
    let tentativas = 1;
    let qs = resultado.questoes;
    while (!validarLote(qs).ok && tentativas < LIMITES.MAX_TENTATIVAS_REGENERACAO) {
      const reg = await ai.regenerateQuestion({ materia: materiaNome, assuntos, dificuldade, quantidade: 1 });
      if (reg) qs[0] = reg; // simplificado: substitui primeira inválida
      tentativas++;
    }
    const finalValid = validarLote(qs);
    if (!finalValid.ok) {
      await executar(c.env.DB, 'INSERT INTO ai_generations (id, room_id, provedor, modelo, prompt, resposta_raw, status) VALUES (?, ?, ?, ?, ?, ?, ?)', novoId('ai_'), id, resultado.provedor, String(c.env.AI_MODEL || ''), resultado.prompt, resultado.raw, 'falha');
      return c.json({ erro: finalValid.erro, provedor: resultado.provedor }, 400);
    }
    resultado.questoes = qs;
  }

  // Armazenamento: limpa antigas se force
  if (force) await executar(c.env.DB, 'DELETE FROM questions WHERE room_id = ?', id);

  // Persiste questões + alternativas
  for (let i = 0; i < resultado.questoes.length; i++) {
    const q = resultado.questoes[i];
    const qid = novoId('q_');
    await executar(c.env.DB, 'INSERT INTO questions (id, room_id, enunciado, explicacao, dificuldade, assunto, ordem, correta_idx) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', qid, id, q.enunciado, q.explicacao, q.dificuldade, q.assunto, i, q.correta_idx);
    for (let j = 0; j < q.alternativas.length; j++) {
      await executar(c.env.DB, 'INSERT INTO question_options (id, question_id, texto, ordem) VALUES (?, ?, ?, ?)', novoId('opt_'), qid, q.alternativas[j], j);
    }
  }

  // Auditoria + log
  await executar(c.env.DB, 'INSERT INTO ai_generations (id, room_id, provedor, modelo, prompt, resposta_raw, status) VALUES (?, ?, ?, ?, ?, ?, ?)', novoId('ai_'), id, resultado.provedor, String(c.env.AI_MODEL || ''), resultado.prompt, resultado.raw, 'sucesso');
  await executar(c.env.DB, 'INSERT INTO admin_logs (id, user_id, acao, alvo_tipo, alvo_id, detalhes) VALUES (?, ?, ?, ?, ?, ?)', novoId('log_'), user.id, 'gerar_questoes', 'rooms', id, JSON.stringify({ quantidade, provedor: resultado.provedor }));
  // Move para REVIEW automaticamente se estava DRAFT
  if (room.status === STATUS.DRAFT) {
    await executar(c.env.DB, 'UPDATE rooms SET status = ?, atualizado_em = ? WHERE id = ?', STATUS.REVIEW, new Date().toISOString(), id);
  }

  const qsFinal = await todas(c.env.DB, 'SELECT * FROM questions WHERE room_id = ? ORDER BY ordem', id);
  return c.json({ ok: true, provedor: resultado.provedor, quantidade: qsFinal.length, questoes: resultado.questoes });
});

// GET /api/rooms/:id/questions — lista questões (ADMIN vê gabarito, USER só se room ACTIVE e com tentativa? Fase 6 protegerá)
rooms.get('/:id/questions', async (c) => {
  const id = c.req.param('id');
  const room: any = await primeira(c.env.DB, 'SELECT * FROM rooms WHERE id = ?', id);
  if (!room) return c.json({ erro: 'Sala não encontrada.' }, 404);
  const user = await usuarioDaSessao(c.env.DB, c.req.raw);
  const isAdm = !!user && ehAdmin(user);
  // só ADMIN pode ver gabarito em REVIEW; em ACTIVE, gabarito protegido (Fase 6)
  if ([STATUS.DRAFT, STATUS.REVIEW].includes(room.status) && !isAdm) return c.json({ erro: 'Sala ainda em revisão.' }, 403);
  const qs = await todas(c.env.DB, 'SELECT * FROM questions WHERE room_id = ? ORDER BY ordem', id);
  const comOpts = await Promise.all(qs.map(async (q: any) => {
    const opts = await todas(c.env.DB, 'SELECT texto, ordem FROM question_options WHERE question_id = ? ORDER BY ordem', q.id);
    // Em ACTIVE, não expõe correta_idx para não-ADMIN (proteção gabarito)
    const hide = room.status === STATUS.ACTIVE && !isAdm;
    return {
      id: q.id, enunciado: q.enunciado, explicacao: hide ? undefined : q.explicacao,
      dificuldade: q.dificuldade, assunto: q.assunto, ordem: q.ordem,
      alternativas: opts.map((o: any) => o.texto),
      ...(hide ? {} : { correta_idx: q.correta_idx })
    };
  }));
  return c.json({ questoes: comOpts });
});
