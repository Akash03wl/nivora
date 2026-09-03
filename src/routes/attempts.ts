import { Hono } from 'hono';
import { usuarioDaSessao } from '../lib/auth.js';
import { primeira, todas, executar, novoId } from '../lib/db.js';
import { STATUS } from '../lib/config.js';
import { pontosDaQuestao } from '../lib/scoring.js';

type Env = { DB: D1Database };

export const attempts = new Hono<{ Bindings: Env }>();

// POST /api/rooms/:id/start — inicia tentativa (1 por user, sala ACTIVE)
attempts.post('/:id/start', async (c) => {
  const user = await usuarioDaSessao(c.env.DB, c.req.raw);
  if (!user) return c.json({ erro: 'Não autenticado.' }, 401);
  const id = c.req.param('id');
  const room: any = await primeira(c.env.DB, 'SELECT * FROM rooms WHERE id = ?', id);
  if (!room) return c.json({ erro: 'Sala não encontrada.' }, 404);
  if (room.status !== STATUS.ACTIVE) return c.json({ erro: `Sala não está ativa (status: ${room.status}).` }, 409);

  // 1 tentativa por user por sala (regra #14)
  const existente: any = await primeira(c.env.DB, 'SELECT id, status FROM attempts WHERE user_id = ? AND room_id = ?', (user as any).id, id);
  if (existente) {
    if (existente.status === 'finalizada') return c.json({ erro: 'Você já finalizou este simulado (1 tentativa).' }, 409);
    // se já tem em_andamento, retorna a mesma
    const qs = await todas(c.env.DB, 'SELECT q.id, q.enunciado, q.ordem, q.dificuldade, q.assunto FROM questions q WHERE q.room_id = ? ORDER BY q.ordem', id);
    const semGabarito = await Promise.all(qs.map(async (q: any) => {
      const opts = await todas(c.env.DB, 'SELECT texto FROM question_options WHERE question_id = ? ORDER BY ordem', q.id);
      return { id: q.id, enunciado: q.enunciado, ordem: q.ordem, dificuldade: q.dificuldade, assunto: q.assunto, alternativas: opts.map((o:any)=>o.texto), tempo_por_questao: room.tempo_por_questao };
    }));
    return c.json({ attempt: existente, questoes: semGabarito, retomada: true });
  }

  const attemptId = 'at_' + novoId('');
  await executar(c.env.DB, 'INSERT INTO attempts (id, user_id, room_id, iniciado_em, status) VALUES (?, ?, ?, ?, ?)', attemptId, (user as any).id, id, new Date().toISOString(), 'em_andamento');
  await executar(c.env.DB, 'INSERT INTO admin_logs (id, user_id, acao, alvo_tipo, alvo_id) VALUES (?, ?, ?, ?, ?)', novoId('log_'), (user as any).id, 'iniciar_tentativa', 'attempts', attemptId);

  const qs = await todas(c.env.DB, 'SELECT id, enunciado, ordem, dificuldade, assunto FROM questions WHERE room_id = ? ORDER BY ordem', id);
  if (!qs.length) return c.json({ erro: 'Simulado sem questões. Aguarde liberação.' }, 409);
  const semGabarito = await Promise.all(qs.map(async (q: any) => {
    const opts = await todas(c.env.DB, 'SELECT texto FROM question_options WHERE question_id = ? ORDER BY ordem', q.id);
    return { id: q.id, enunciado: q.enunciado, ordem: q.ordem, dificuldade: q.dificuldade, assunto: q.assunto, alternativas: opts.map((o:any)=>o.texto), tempo_por_questao: room.tempo_por_questao };
  }));

  const attempt = await primeira(c.env.DB, 'SELECT * FROM attempts WHERE id = ?', attemptId);
  return c.json({ attempt, questoes: semGabarito }, 201);
});

// GET /api/rooms/:id/attempt — estado da tentativa atual (sem gabarito)
attempts.get('/:id/attempt', async (c) => {
  const user = await usuarioDaSessao(c.env.DB, c.req.raw);
  if (!user) return c.json({ erro: 'Não autenticado.' }, 401);
  const id = c.req.param('id');
  const att: any = await primeira(c.env.DB, 'SELECT * FROM attempts WHERE user_id = ? AND room_id = ?', (user as any).id, id);
  if (!att) return c.json({ erro: 'Nenhuma tentativa encontrada.' }, 404);
  const respostas = await todas(c.env.DB, 'SELECT question_id, alternativa_idx, correta, tempo_gasto FROM answers WHERE attempt_id = ?', att.id);
  const respondidas = new Set(respostas.map((r:any)=>r.question_id));
  return c.json({ attempt: { ...att, respondidas: Array.from(respondidas), total_respondidas: respostas.length } });
});

// POST /api/rooms/:id/answer — registra resposta (protege gabarito, valida tempo no backend)
attempts.post('/:id/answer', async (c) => {
  const user = await usuarioDaSessao(c.env.DB, c.req.raw);
  if (!user) return c.json({ erro: 'Não autenticado.' }, 401);
  const id = c.req.param('id');
  let body: any = {};
  try { body = await c.req.json(); } catch {}
  const questionId = String(body.question_id || body.questao_id || '').trim();
  const alternativa = body.alternativa_idx !== undefined ? Number(body.alternativa_idx) : null;
  const tempoGasto = Math.max(0, Math.floor(Number(body.tempo_gasto ?? body.tempoGasto ?? 0)));
  if (!questionId) return c.json({ erro: 'question_id obrigatório.' }, 400);

  const room: any = await primeira(c.env.DB, 'SELECT * FROM rooms WHERE id = ?', id);
  if (!room) return c.json({ erro: 'Sala não encontrada.' }, 404);
  const att: any = await primeira(c.env.DB, 'SELECT * FROM attempts WHERE user_id = ? AND room_id = ?', (user as any).id, id);
  if (!att) return c.json({ erro: 'Inicie o simulado primeiro.' }, 400);
  if (att.status === 'finalizada') return c.json({ erro: 'Tentativa já finalizada. Não é possível alterar respostas.' }, 409);

  const q: any = await primeira(c.env.DB, 'SELECT id, correta_idx FROM questions WHERE id = ? AND room_id = ?', questionId, id);
  if (!q) return c.json({ erro: 'Questão não encontrada.' }, 404);
  const ja = await primeira(c.env.DB, 'SELECT id FROM answers WHERE attempt_id = ? AND question_id = ?', att.id, questionId);
  if (ja) return c.json({ erro: 'Questão já respondida. Não é possível alterar.' }, 409);

  // tempo oficial validado no backend: se excedeu tempo_por_questao, registra como não respondida (null) e não pontua
  const limite = Number(room.tempo_por_questao) || 0;
  let alternativaFinal: number | null = alternativa;
  let correta = 0;
  if (limite > 0 && tempoGasto > limite) {
    alternativaFinal = null; // expirou
    correta = 0;
  } else if (alternativaFinal !== null && alternativaFinal >= 0 && alternativaFinal < 5) {
    correta = alternativaFinal === q.correta_idx ? 1 : 0;
  } else {
    alternativaFinal = null;
    correta = 0;
  }

  await executar(c.env.DB, 'INSERT INTO answers (id, attempt_id, question_id, alternativa_idx, correta, tempo_gasto) VALUES (?, ?, ?, ?, ?, ?)', novoId('ans_'), att.id, questionId, alternativaFinal, correta, tempoGasto);
  return c.json({ ok: true, correta: !!correta, expirada: alternativaFinal === null && limite > 0 && tempoGasto > limite });
});

// POST /api/rooms/:id/finish — finaliza e corrige no backend (nunca confia no cliente)
attempts.post('/:id/finish', async (c) => {
  const user = await usuarioDaSessao(c.env.DB, c.req.raw);
  if (!user) return c.json({ erro: 'Não autenticado.' }, 401);
  const id = c.req.param('id');
  const room: any = await primeira(c.env.DB, 'SELECT * FROM rooms WHERE id = ?', id);
  if (!room) return c.json({ erro: 'Sala não encontrada.' }, 404);
  const att: any = await primeira(c.env.DB, 'SELECT * FROM attempts WHERE user_id = ? AND room_id = ?', (user as any).id, id);
  if (!att) return c.json({ erro: 'Nenhuma tentativa para finalizar.' }, 404);
  if (att.status === 'finalizada') {
    const respostas = await todas(c.env.DB, 'SELECT * FROM answers WHERE attempt_id = ?', att.id);
    const qs = await todas(c.env.DB, 'SELECT id, correta_idx, explicacao FROM questions WHERE room_id = ?', id);
    return c.json({ ja_finalizada: true, attempt: att, respostas, gabarito: qs });
  }

  // Calcula correção oficial no servidor
  const respostas = await todas(c.env.DB, 'SELECT question_id, alternativa_idx, correta, tempo_gasto FROM answers WHERE attempt_id = ?', att.id);
  const totalQuestoes = (await primeira<{ c:number }>(c.env.DB, 'SELECT COUNT(*) as c FROM questions WHERE room_id = ?', id))?.c || 0;
  let acertos = 0;
  let pontuacao = 0;
  let tempoTotal = 0;
  for (const r of respostas as any[]) {
    tempoTotal += Number(r.tempo_gasto) || 0;
    if (r.correta) {
      acertos++;
      pontuacao += pontosDaQuestao(true, Number(r.tempo_gasto) || 0, Number(room.tempo_por_questao) || 0);
    }
  }
  // questões não respondidas contam como erro
  const erros = totalQuestoes - acertos; // inclui não respondidas
  const naoRespondidas = totalQuestoes - (respostas as any[]).length;
  // tempo total oficial: diferença entre iniciado e agora (não confia no cliente)
  const iniciado = new Date(att.iniciado_em).getTime();
  const agora = Date.now();
  const tempoOficial = Math.floor((agora - iniciado)/1000);
  // usa maior entre soma dos tempos e tempo oficial para evitar fraude (cliente enviou tempos menores)
  const tempoFinal = Math.max(tempoTotal, Math.min(tempoOficial, totalQuestoes * (Number(room.tempo_por_questao) || 30) * 2));

  await executar(c.env.DB, 'UPDATE attempts SET finalizado_em = ?, acertos = ?, erros = ?, pontuacao = ?, tempo_total = ?, status = ? WHERE id = ?', new Date().toISOString(), acertos, erros, pontuacao, tempoFinal, 'finalizada', att.id);
  // scores espelho para ranking
  await executar(c.env.DB, 'INSERT OR REPLACE INTO scores (id, attempt_id, user_id, room_id, acertos, pontuacao, tempo_total) VALUES (?, ?, ?, ?, ?, ?, ?)', novoId('sc_'), att.id, (user as any).id, id, acertos, pontuacao, tempoFinal);

  const attemptFinal: any = await primeira(c.env.DB, 'SELECT * FROM attempts WHERE id = ?', att.id);
  const qsGabarito = await todas(c.env.DB, 'SELECT id, enunciado, correta_idx, explicacao, assunto FROM questions WHERE room_id = ? ORDER BY ordem', id);
  const optsMap = new Map<string, string[]>();
  for (const q of qsGabarito as any[]) {
    const opts = await todas(c.env.DB, 'SELECT texto FROM question_options WHERE question_id = ? ORDER BY ordem', q.id);
    optsMap.set(q.id, opts.map((o:any)=>o.texto));
  }
  const resultado = {
    acertos, erros, total: totalQuestoes, naoRespondidas,
    pontuacao, tempoTotal: tempoFinal,
    aproveitamento: totalQuestoes ? Math.round(acertos/totalQuestoes*100) : 0,
    posicao: null as number | null
  };
  // calcula posição no ranking da sala (ordenação: acertos desc, pontuacao desc, tempo asc)
  const ranking = await todas(c.env.DB, 'SELECT acertos, pontuacao, tempo_total FROM attempts WHERE room_id = ? AND status = ? ORDER BY acertos DESC, pontuacao DESC, tempo_total ASC', id, 'finalizada');
  const idx = (ranking as any[]).findIndex(r => r.acertos===acertos && r.pontuacao===pontuacao && r.tempo_total===tempoFinal);
  // fallback: conta quantos estão acima (para lidar com empates)
  let acima = 0;
  for (const r of ranking as any[]) {
    if (r.acertos > acertos) acima++;
    else if (r.acertos === acertos && r.pontuacao > pontuacao) acima++;
    else if (r.acertos === acertos && r.pontuacao === pontuacao && r.tempo_total < tempoFinal) acima++;
  }
  resultado.posicao = acima + 1;

  return c.json({
    attempt: attemptFinal,
    resultado,
    gabarito: (qsGabarito as any[]).map(q=>({ id:q.id, correta_idx: q.correta_idx, explicacao: q.explicacao, alternativas: optsMap.get(q.id) })),
    respostas: respostas.map((r:any)=>({ question_id: r.question_id, alternativa_idx: r.alternativa_idx, correta: !!r.correta, tempo_gasto: r.tempo_gasto }))
  });
});
