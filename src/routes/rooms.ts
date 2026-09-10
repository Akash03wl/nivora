import { Hono } from 'hono';
import { usuarioDaSessao, ehAdmin } from '../lib/auth.js';
import { primeira, todas, executar, novoId } from '../lib/db.js';
import { STATUS, LIMITES } from '../lib/config.js';
import { AIService, validarLote, repararLote } from '../lib/ai.js';
import { checar } from '../lib/rateLimit.js';
import { limparTexto } from '../lib/validation.js';

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

// POST /api/rooms — criar (ADMIN) + rate limit por usuário (B16)
rooms.post('/', async (c) => {
  const chk = await exigirAdmin(c);
  if ('erro' in chk) return chk.erro;
  const lim = await checar(c.env.DB, c.req.raw, 'rooms-create', 10, 60, (chk.user as any).id);
  if (!lim.ok) return c.json({ erro: 'Muitas salas criadas. Aguarde.' }, 429);
  const user: any = chk.user;
  let body: any = {};
  try { body = await c.req.json(); } catch {}
  const nome = limparTexto(body.nome || body.titulo, LIMITES.MAX_TITULO);
  if (nome.length < 3) return c.json({ erro: 'Nome deve ter 3-80 caracteres.' }, 400);
  const descricao = limparTexto(body.descricao, LIMITES.MAX_DESCRICAO);
  const materia_id = body.materia_id ? String(body.materia_id).trim() : null;
  if (materia_id) {
    const m = await primeira(c.env.DB, 'SELECT id FROM subjects WHERE id = ?', materia_id);
    if (!m) return c.json({ erro: 'Matéria não encontrada.' }, 400);
  }
  const assuntos = Array.isArray(body.assuntos) ? body.assuntos.map((s: any)=>limparTexto(s, 40)).filter(Boolean).slice(0, LIMITES.MAX_ASSUNTOS) : [];
  if (!assuntos.length) return c.json({ erro: 'Informe pelo menos um assunto.' }, 400);
  const qtdRaw = body.quantidade;
  const quantidade = qtdRaw === undefined || qtdRaw === null || qtdRaw === '' ? 10 : Number(qtdRaw);
  // M8: qualquer valor inteiro entre MIN_QUESTOES e MAX_QUESTOES (5–50)
  if (!Number.isInteger(quantidade) || quantidade < LIMITES.MIN_QUESTOES || quantidade > LIMITES.MAX_QUESTOES) return c.json({ erro: `Quantidade deve ser um inteiro entre ${LIMITES.MIN_QUESTOES} e ${LIMITES.MAX_QUESTOES}.` }, 400);
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
  }
  if (!isAdm) {
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

// M6 — GET /api/rooms/by-code/:codigo — entrar em sala pelo código (público, como a listagem)
rooms.get('/by-code/:codigo', async (c) => {
  const codigo = String(c.req.param('codigo') || '').trim().toUpperCase();
  if (!codigo) return c.json({ erro: 'Código obrigatório.' }, 400);
  const room: any = await primeira(c.env.DB, 'SELECT * FROM rooms WHERE codigo = ?', codigo);
  if (!room) return c.json({ erro: 'Sala não encontrada para este código.' }, 404);
  if ([STATUS.DRAFT, STATUS.REVIEW, STATUS.ARCHIVED].includes(room.status)) return c.json({ erro: 'Sala não disponível para este código.' }, 404);
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
    const n = limparTexto(body.nome, LIMITES.MAX_TITULO);
    if (n.length < 3) return c.json({ erro: 'Nome inválido.' }, 400);
    sets.push('nome = ?'); params.push(n);
  }
  if (body.descricao !== undefined) { sets.push('descricao = ?'); params.push(limparTexto(body.descricao, LIMITES.MAX_DESCRICAO)); }
  if (body.assuntos !== undefined) {
    const a = Array.isArray(body.assuntos) ? body.assuntos.map((s:any)=>limparTexto(s, 40)).filter(Boolean).slice(0, LIMITES.MAX_ASSUNTOS) : [];
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

  // Rate limit IA: 5/min por admin (B16: por usuário)
  const lim = await checar(c.env.DB, c.req.raw, 'ia-generate', 5, 60, user.id);
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

  // Validação de schema + conteúdo — B9/B13: encontra o índice realmente inválido e completa se faltar
  // B13: se veio menos que o pedido, tenta completar (regenerate) antes de reprovar
  if (resultado.questoes.length < quantidade) {
    const faltam = quantidade - resultado.questoes.length;
    for (let f = 0; f < faltam; f++) {
      const reg = await ai.regenerateQuestion({ materia: materiaNome, assuntos, dificuldade, quantidade: 1 });
      if (reg) resultado.questoes.push(reg);
    }
    if (resultado.questoes.length < quantidade) {
      await executar(c.env.DB, 'INSERT INTO ai_generations (id, room_id, provedor, modelo, prompt, resposta_raw, status) VALUES (?, ?, ?, ?, ?, ?, ?)', novoId('ai_'), id, resultado.provedor, String(c.env.AI_MODEL || ''), resultado.prompt, JSON.stringify({ aviso: `Retornou ${resultado.questoes.length} de ${quantidade}` }), 'falha');
      return c.json({ erro: `A IA retornou só ${resultado.questoes.length} de ${quantidade} questões. Tente novamente com ?force=1.`, provedor: resultado.provedor, aviso: `Faltaram ${quantidade - resultado.questoes.length}` }, 400);
    }
  }
  // B9/B13: repara o lote (substitui índice inválido exato / resolve duplicidades) antes de persistir
  const reparado = await repararLote(resultado.questoes, () => ai.regenerateQuestion({ materia: materiaNome, assuntos, dificuldade, quantidade: 1 }));
  if (!reparado.ok) {
    await executar(c.env.DB, 'INSERT INTO ai_generations (id, room_id, provedor, modelo, prompt, resposta_raw, status) VALUES (?, ?, ?, ?, ?, ?, ?)', novoId('ai_'), id, resultado.provedor, String(c.env.AI_MODEL || ''), resultado.prompt, resultado.raw, 'falha');
    return c.json({ erro: reparado.erro || 'Lote inválido após regeneração.', provedor: resultado.provedor }, 400);
  }
  resultado.questoes = reparado.questoes;
  const valid = validarLote(resultado.questoes);
  if (!valid.ok) return c.json({ erro: valid.erro, provedor: resultado.provedor }, 400);

  const writes: D1PreparedStatement[] = [];
  // Armazenamento: limpa antigas se force
  if (force) writes.push(c.env.DB.prepare('DELETE FROM questions WHERE room_id = ?').bind(id));

  // Persiste questões + alternativas
  for (let i = 0; i < resultado.questoes.length; i++) {
    const q = resultado.questoes[i];
    const qid = novoId('q_');
    writes.push(c.env.DB.prepare('INSERT INTO questions (id, room_id, enunciado, explicacao, dificuldade, assunto, ordem, correta_idx) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(qid, id, q.enunciado, q.explicacao, q.dificuldade, q.assunto, i, q.correta_idx));
    for (let j = 0; j < q.alternativas.length; j++) {
      writes.push(c.env.DB.prepare('INSERT INTO question_options (id, question_id, texto, ordem) VALUES (?, ?, ?, ?)').bind(novoId('opt_'), qid, q.alternativas[j], j));
    }
  }

  // Auditoria + log
  writes.push(c.env.DB.prepare('INSERT INTO ai_generations (id, room_id, provedor, modelo, prompt, resposta_raw, status) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(novoId('ai_'), id, resultado.provedor, String(c.env.AI_MODEL || ''), resultado.prompt, resultado.raw, 'sucesso'));
  writes.push(c.env.DB.prepare('INSERT INTO admin_logs (id, user_id, acao, alvo_tipo, alvo_id, detalhes) VALUES (?, ?, ?, ?, ?, ?)').bind(novoId('log_'), user.id, 'gerar_questoes', 'rooms', id, JSON.stringify({ quantidade, provedor: resultado.provedor })));
  // Move para REVIEW automaticamente se estava DRAFT
  if (room.status === STATUS.DRAFT) {
    writes.push(c.env.DB.prepare('UPDATE rooms SET status = ?, atualizado_em = ? WHERE id = ?').bind(STATUS.REVIEW, new Date().toISOString(), id));
  }

  await c.env.DB.batch(writes);
  const qsFinal = await todas(c.env.DB, 'SELECT * FROM questions WHERE room_id = ? ORDER BY ordem', id);
  const aviso = resultado.provedor === 'mock-local' ? 'Nenhum provedor de IA configurado — questões genéricas geradas localmente. Revise antes de publicar.' : undefined;
  return c.json({ ok: true, provedor: resultado.provedor, quantidade: qsFinal.length, questoes: resultado.questoes, ...(aviso ? { aviso } : {}) });
});

// M5 — POST /api/rooms/:id/questions/:questionId/regenerate — regenera UMA questão (ADMIN, sala DRAFT/REVIEW)
rooms.post('/:id/questions/:questionId/regenerate', async (c) => {
  const chk = await exigirAdmin(c);
  if ('erro' in chk) return chk.erro;
  const user: any = chk.user;
  const id = c.req.param('id');
  const questionId = c.req.param('questionId');
  const room: any = await primeira(c.env.DB, 'SELECT * FROM rooms WHERE id = ?', id);
  if (!room) return c.json({ erro: 'Sala não encontrada.' }, 404);
  if (![STATUS.DRAFT, STATUS.REVIEW].includes(room.status)) return c.json({ erro: `Só é possível regenerar em DRAFT/REVIEW (atual: ${room.status}).` }, 409);
  const q: any = await primeira(c.env.DB, 'SELECT * FROM questions WHERE id = ? AND room_id = ?', questionId, id);
  if (!q) return c.json({ erro: 'Questão não encontrada.' }, 404);
  const lim = await checar(c.env.DB, c.req.raw, 'ia-generate', 5, 60, user.id);
  if (!lim.ok) return c.json({ erro: 'Muitas gerações. Aguarde.' }, 429);

  let materiaNome = 'Geral';
  if (room.materia_id) {
    const m: any = await primeira(c.env.DB, 'SELECT nome FROM subjects WHERE id = ?', room.materia_id);
    if (m) materiaNome = m.nome;
  }
  const assuntos = JSON.parse(room.assuntos || '[]') as string[];
  const ai = new AIService(c.env);
  const nova = await ai.regenerateQuestion({ materia: materiaNome, assuntos, dificuldade: String(room.dificuldade || 'medio'), quantidade: 1 });
  if (!nova) return c.json({ erro: 'Falha ao regenerar a questão. Tente novamente.' }, 502);
  // evita duplicar enunciado de outra questão da mesma sala
  const demais = await todas(c.env.DB, 'SELECT enunciado FROM questions WHERE room_id = ? AND id != ?', id, questionId);
  const repetida = demais.some((d: any) => String(d.enunciado).toLowerCase().trim() === String(nova.enunciado).toLowerCase().trim());
  if (repetida) return c.json({ erro: 'A questão gerada repetiu outra da sala. Tente novamente.' }, 409);

  const writes: D1PreparedStatement[] = [];
  writes.push(c.env.DB.prepare('UPDATE questions SET enunciado = ?, explicacao = ?, dificuldade = ?, assunto = ?, correta_idx = ? WHERE id = ?').bind(nova.enunciado, nova.explicacao, nova.dificuldade, nova.assunto, nova.correta_idx, questionId));
  writes.push(c.env.DB.prepare('DELETE FROM question_options WHERE question_id = ?').bind(questionId));
  for (let j = 0; j < nova.alternativas.length; j++) {
    writes.push(c.env.DB.prepare('INSERT INTO question_options (id, question_id, texto, ordem) VALUES (?, ?, ?, ?)').bind(novoId('opt_'), questionId, nova.alternativas[j], j));
  }
  writes.push(c.env.DB.prepare('INSERT INTO admin_logs (id, user_id, acao, alvo_tipo, alvo_id, detalhes) VALUES (?, ?, ?, ?, ?, ?)').bind(novoId('log_'), user.id, 'regenerar_questao', 'questions', questionId, JSON.stringify({ room_id: id })));
  await c.env.DB.batch(writes);
  const atualizada: any = await primeira(c.env.DB, 'SELECT * FROM questions WHERE id = ?', questionId);
  const opts = await todas(c.env.DB, 'SELECT texto FROM question_options WHERE question_id = ? ORDER BY ordem', questionId);
  const semIA = !c.env.AI && !c.env.AI_API_KEY;
  return c.json({ ok: true, questao: { ...atualizada, alternativas: opts.map((o: any) => o.texto) }, ...(semIA ? { aviso: 'Nenhum provedor de IA configurado — questão genérica gerada localmente. Revise antes de publicar.' } : {}) });
});

// GET /api/rooms/:id/questions — lista questões (ADMIN vê gabarito, USER só se room ACTIVE e com tentativa? Fase 6 protegerá)
rooms.get('/:id/questions', async (c) => {
  const id = c.req.param('id');
  const room: any = await primeira(c.env.DB, 'SELECT * FROM rooms WHERE id = ?', id);
  if (!room) return c.json({ erro: 'Sala não encontrada.' }, 404);
  const user = await usuarioDaSessao(c.env.DB, c.req.raw);
  const isAdm = !!user && ehAdmin(user);
  // só ADMIN pode ver gabarito em REVIEW; em ACTIVE/PUBLISHED, gabarito protegido (B4)
  if ([STATUS.DRAFT, STATUS.REVIEW].includes(room.status) && !isAdm) return c.json({ erro: 'Sala ainda em revisão.' }, 403);
  const qs = await todas(c.env.DB, 'SELECT * FROM questions WHERE room_id = ? ORDER BY ordem', id);
  const comOpts = await Promise.all(qs.map(async (q: any) => {
    const opts = await todas(c.env.DB, 'SELECT texto, ordem FROM question_options WHERE question_id = ? ORDER BY ordem', q.id);
    // Em PUBLISHED/ACTIVE, não expõe correta_idx para não-ADMIN (B4)
    const hide = !isAdm;
    return {
      id: q.id, enunciado: q.enunciado, explicacao: hide ? undefined : q.explicacao,
      dificuldade: q.dificuldade, assunto: q.assunto, ordem: q.ordem,
      alternativas: opts.map((o: any) => o.texto),
      ...(hide ? {} : { correta_idx: q.correta_idx })
    };
  }));
  return c.json({ questoes: comOpts });
});
