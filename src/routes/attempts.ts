import { Hono } from 'hono';
import { usuarioDaSessao } from '../lib/auth.js';
import { primeira, todas, executar, novoId } from '../lib/db.js';
import { STATUS } from '../lib/config.js';
import { pontosDaQuestao, calcularPosicao } from '../lib/scoring.js';
import { checar } from '../lib/rateLimit.js';

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
  const existente: any = await primeira(c.env.DB, 'SELECT * FROM attempts WHERE user_id = ? AND room_id = ?', (user as any).id, id);
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

  const count = await primeira<{ c: number }>(c.env.DB, 'SELECT COUNT(*) as c FROM questions WHERE room_id = ?', id);
  if (!count?.c) return c.json({ erro: 'Simulado sem questões. Aguarde liberação.' }, 409);
  const attemptId = 'at_' + novoId('');
  const agoraIso = new Date().toISOString();
  // B12: try/catch para corrida (UNIQUE user,room)
  try {
    await executar(c.env.DB, 'INSERT INTO attempts (id, user_id, room_id, iniciado_em, status, ultima_resposta_em) VALUES (?, ?, ?, ?, ?, ?)', attemptId, (user as any).id, id, agoraIso, 'em_andamento', agoraIso);
  } catch (e: any) {
    const msg = String(e?.message || '');
    if (msg.includes('UNIQUE') || msg.includes('unique') || msg.includes('constraint')) {
      const existente2: any = await primeira(c.env.DB, 'SELECT id, status FROM attempts WHERE user_id = ? AND room_id = ?', (user as any).id, id);
      if (existente2) return c.json({ erro: 'Você já iniciou este simulado.' }, 409);
    }
    throw e;
  }
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
  const lim = await checar(c.env.DB, c.req.raw, 'answer', 30, 60, (user as any).id);
  if (!lim.ok) return c.json({ erro: 'Muitas respostas. Aguarde.' }, 429);
  const id = c.req.param('id');
  let body: any = {};
  try { body = await c.req.json(); } catch {}
  const questionId = String(body.question_id || body.questao_id || '').trim();
  const alternativa = body.alternativa_idx !== undefined ? (body.alternativa_idx === null ? null : Number(body.alternativa_idx)) : null;
  const tempoGasto = Math.max(0, Math.floor(Number(body.tempo_gasto ?? body.tempoGasto ?? 0)));
  if (!questionId) return c.json({ erro: 'question_id obrigatório.' }, 400);

  const room: any = await primeira(c.env.DB, 'SELECT * FROM rooms WHERE id = ?', id);
  if (!room) return c.json({ erro: 'Sala não encontrada.' }, 404);
  const att: any = await primeira(c.env.DB, 'SELECT * FROM attempts WHERE user_id = ? AND room_id = ?', (user as any).id, id);
  if (!att) return c.json({ erro: 'Inicie o simulado primeiro.' }, 400);
  if (att.status === 'finalizada') return c.json({ erro: 'Tentativa já finalizada. Não é possível alterar respostas.' }, 409);

  const q: any = await primeira(c.env.DB, 'SELECT id, correta_idx FROM questions WHERE id = ? AND room_id = ?', questionId, id);
  if (!q) return c.json({ erro: 'Questão não encontrada.' }, 404);
  const opcaoExiste = alternativa !== null && Number.isInteger(alternativa) && alternativa >= 0
    ? await primeira(c.env.DB, 'SELECT id FROM question_options WHERE question_id = ? AND ordem = ?', questionId, alternativa)
    : null;
  const ja = await primeira(c.env.DB, 'SELECT id FROM answers WHERE attempt_id = ? AND question_id = ?', att.id, questionId);
  if (ja) return c.json({ erro: 'Questão já respondida. Não é possível alterar.', codigo: 'ALREADY_ANSWERED' }, 409);

  // B8: tempo validado no servidor, não no cliente
  const limite = Number(room.tempo_por_questao) || 0;
  const agora = Date.now();
  const ultima = att.ultima_resposta_em ? new Date(att.ultima_resposta_em).getTime() : new Date(att.iniciado_em).getTime();
  const tempoServidor = Math.max(0, Math.floor((agora - ultima) / 1000));
  // usa tempo do servidor para bônus, ignora o enviado pelo cliente (B8)
  const tempoParaBonus = tempoServidor;
  // mas também registra o expirado baseado no tempo real: se servidor > limite, expira
  let alternativaFinal: number | null = alternativa;
  let correta = 0;
  const expirouServidor = limite > 0 && tempoServidor > limite;
  if (expirouServidor) {
    alternativaFinal = null;
    correta = 0;
  } else if (opcaoExiste) {
    correta = alternativaFinal === q.correta_idx ? 1 : 0;
  } else {
    alternativaFinal = null;
    correta = 0;
  }

  const answerId = novoId('ans_');
  // B12: try/catch para corrida em answers (UNIQUE attempt,question)
  try {
    const result = await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO answers (id, attempt_id, question_id, alternativa_idx, correta, tempo_gasto) SELECT ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM attempts WHERE id = ? AND status = 'em_andamento' AND COALESCE(ultima_resposta_em, iniciado_em) = ?)").bind(answerId, att.id, questionId, alternativaFinal, correta, tempoParaBonus, att.id, att.ultima_resposta_em || att.iniciado_em),
      c.env.DB.prepare('UPDATE attempts SET ultima_resposta_em = ? WHERE id = ? AND EXISTS (SELECT 1 FROM answers WHERE id = ?)').bind(new Date(agora).toISOString(), att.id, answerId)
    ]);
    if (!result[0].meta.changes) return c.json({ erro: 'A tentativa mudou. Retome o simulado para atualizar.' }, 409);
  } catch (e: any) {
    const msg = String(e?.message || '');
    if (msg.includes('UNIQUE') || msg.includes('unique') || msg.includes('constraint')) {
      return c.json({ erro: 'Questão já respondida.', codigo: 'ALREADY_ANSWERED' }, 409);
    }
    throw e;
  }
  // atualiza ultima_resposta_em para próxima questão (B8)

  return c.json({ ok: true, correta: !!correta, expirada: alternativaFinal === null && expirouServidor, tempoServidor });
});

// POST /api/rooms/:id/finish — finaliza e corrige no backend (nunca confia no cliente)
attempts.post('/:id/finish', async (c) => {
  const user = await usuarioDaSessao(c.env.DB, c.req.raw);
  if (!user) return c.json({ erro: 'Não autenticado.' }, 401);
  const lim = await checar(c.env.DB, c.req.raw, 'finish', 10, 60, (user as any).id);
  if (!lim.ok) return c.json({ erro: 'Muitas finalizações. Aguarde.' }, 429);
  const id = c.req.param('id');
  const room: any = await primeira(c.env.DB, 'SELECT * FROM rooms WHERE id = ?', id);
  if (!room) return c.json({ erro: 'Sala não encontrada.' }, 404);
  const att: any = await primeira(c.env.DB, 'SELECT * FROM attempts WHERE user_id = ? AND room_id = ?', (user as any).id, id);
  if (!att) return c.json({ erro: 'Nenhuma tentativa para finalizar.' }, 404);
  if (att.status === 'finalizada') {
    // B17: unifica formato com /result (antes era mais simples)
    const respostas = await todas(c.env.DB, 'SELECT * FROM answers WHERE attempt_id = ?', att.id);
    const qs = await todas(c.env.DB, 'SELECT id, enunciado, correta_idx, explicacao, assunto FROM questions WHERE room_id = ? ORDER BY ordem', id);
    const optsMap2 = new Map<string, string[]>();
    for (const q of qs as any[]) {
      const opts = await todas(c.env.DB, 'SELECT texto FROM question_options WHERE question_id = ? ORDER BY ordem', q.id);
      optsMap2.set(q.id, opts.map((o:any)=>o.texto));
    }
    const totalQ = (qs as any[]).length;
    const rankingJa = await todas(c.env.DB, 'SELECT acertos, pontuacao, tempo_total FROM attempts WHERE room_id = ? AND status = ? ORDER BY acertos DESC, pontuacao DESC, tempo_total ASC', id, 'finalizada');
    const posJa = calcularPosicao(rankingJa as any[], { acertos: att.acertos, pontuacao: att.pontuacao, tempo_total: att.tempo_total });
    return c.json({ ja_finalizada: true, attempt: att, resultado: { acertos: att.acertos, erros: att.erros, total: totalQ, pontuacao: att.pontuacao, tempoTotal: att.tempo_total, aproveitamento: totalQ ? Math.round(att.acertos/totalQ*100):0, posicao: posJa }, respostas, gabarito: (qs as any[]).map(q=>({ id:q.id, enunciado:q.enunciado, correta_idx:q.correta_idx, explicacao:q.explicacao, alternativas: optsMap2.get(q.id) })) });
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

  const finalized = await c.env.DB.batch([
    c.env.DB.prepare("UPDATE attempts SET finalizado_em = ?, acertos = ?, erros = ?, pontuacao = ?, tempo_total = ?, status = 'finalizada' WHERE id = ? AND status = 'em_andamento' AND (SELECT COUNT(*) FROM answers WHERE attempt_id = ?) = ?").bind(new Date().toISOString(), acertos, erros, pontuacao, tempoFinal, att.id, att.id, respostas.length),
    c.env.DB.prepare("INSERT INTO scores (id, attempt_id, user_id, room_id, acertos, pontuacao, tempo_total) SELECT ?, id, user_id, room_id, acertos, pontuacao, tempo_total FROM attempts WHERE id = ? AND status = 'finalizada' ON CONFLICT(attempt_id) DO NOTHING").bind(novoId('sc_'), att.id)
  ]);
  if (!finalized[0].meta.changes) return c.json({ erro: 'A tentativa mudou durante a correção. Retome para consultar ou finalizar.' }, 409);

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
  // B17: posição única
  const ranking = await todas(c.env.DB, 'SELECT acertos, pontuacao, tempo_total FROM attempts WHERE room_id = ? AND status = ? ORDER BY acertos DESC, pontuacao DESC, tempo_total ASC', id, 'finalizada');
  resultado.posicao = calcularPosicao(ranking as any[], { acertos, pontuacao, tempo_total: tempoFinal });

  return c.json({
    attempt: attemptFinal,
    resultado,
    gabarito: (qsGabarito as any[]).map(q=>({ id:q.id, correta_idx: q.correta_idx, explicacao: q.explicacao, alternativas: optsMap.get(q.id) })),
    respostas: respostas.map((r:any)=>({ question_id: r.question_id, alternativa_idx: r.alternativa_idx, correta: !!r.correta, tempo_gasto: r.tempo_gasto }))
  });
});

// GET /api/rooms/:id/ranking — ranking por sala (ordenação: acertos, pontuacao, tempo)
attempts.get('/:id/ranking', async (c) => {
  const id = c.req.param('id');
  const room: any = await primeira(c.env.DB, 'SELECT id, status FROM rooms WHERE id = ?', id);
  if (!room) return c.json({ erro: 'Sala não encontrada.' }, 404);
  // ranking só faz sentido para salas publicadas/ativas/fechadas; DRAFT/REVIEW retorna vazio
  const lista = await todas(c.env.DB,
    `SELECT a.id, a.user_id, u.nick, u.avatar, a.acertos, a.erros, a.pontuacao, a.tempo_total, a.finalizado_em
     FROM attempts a JOIN users u ON u.id = a.user_id
     WHERE a.room_id = ? AND a.status = 'finalizada'
     ORDER BY a.acertos DESC, a.pontuacao DESC, a.tempo_total ASC LIMIT 100`, id);
  const ranking = (lista as any[]).map((r, idx) => ({
    posicao: calcularPosicao(lista as any[], r),
    user_id: r.user_id, nick: r.nick, avatar: r.avatar,
    acertos: r.acertos, erros: r.erros, pontuacao: r.pontuacao, tempo_total: r.tempo_total,
    finalizado_em: r.finalizado_em
  }));
  return c.json({ room_id: id, total: ranking.length, ranking });
});

// GET /api/rooms/:id/result — resultado persistido do usuário (sem recalcular)
attempts.get('/:id/result', async (c) => {
  const user = await usuarioDaSessao(c.env.DB, c.req.raw);
  if (!user) return c.json({ erro: 'Não autenticado.' }, 401);
  const id = c.req.param('id');
  const att: any = await primeira(c.env.DB, 'SELECT * FROM attempts WHERE user_id = ? AND room_id = ?', (user as any).id, id);
  if (!att) return c.json({ erro: 'Nenhuma tentativa encontrada.' }, 404);
  if (att.status !== 'finalizada') return c.json({ erro: 'Finalize o simulado para ver o resultado.' }, 409);
  const totalQuestoes = (await primeira<{ c:number }>(c.env.DB, 'SELECT COUNT(*) as c FROM questions WHERE room_id = ?', id))?.c || 0;
  const respostas = await todas(c.env.DB, 'SELECT question_id, alternativa_idx, correta, tempo_gasto FROM answers WHERE attempt_id = ?', att.id);
  const qs = await todas(c.env.DB, 'SELECT id, enunciado, correta_idx, explicacao, assunto FROM questions WHERE room_id = ? ORDER BY ordem', id);
  // M2: inclui as alternativas de cada questão para a tela de resultado revisar a prova
  const optsMap = new Map<string, string[]>();
  for (const q of qs as any[]) {
    const opts = await todas(c.env.DB, 'SELECT texto FROM question_options WHERE question_id = ? ORDER BY ordem', q.id);
    optsMap.set(q.id, opts.map((o: any) => o.texto));
  }
  const porQuestao = (qs as any[]).map(q => {
    const r: any = (respostas as any[]).find(x => x.question_id === q.id);
    return {
      question_id: q.id, enunciado: q.enunciado, assunto: q.assunto,
      alternativas: optsMap.get(q.id),
      sua_resposta: r ? r.alternativa_idx : null,
      correta_idx: q.correta_idx,
      acertou: r ? !!r.correta : false,
      explicacao: q.explicacao,
      tempo_gasto: r ? r.tempo_gasto : null
    };
  });
  // B17: posição única (mesma regra usada em /finish, /history e /stats)
  const ranking = await todas(c.env.DB, 'SELECT acertos, pontuacao, tempo_total FROM attempts WHERE room_id = ? AND status = ? ORDER BY acertos DESC, pontuacao DESC, tempo_total ASC', id, 'finalizada');
  const pos = calcularPosicao(ranking as any[], { acertos: att.acertos, pontuacao: att.pontuacao, tempo_total: att.tempo_total });
  return c.json({
    attempt: att,
    resultado: {
      acertos: att.acertos, erros: att.erros, total: totalQuestoes,
      pontuacao: att.pontuacao, tempoTotal: att.tempo_total,
      aproveitamento: totalQuestoes ? Math.round(att.acertos/totalQuestoes*100) : 0,
      posicao: pos
    },
    porQuestao
  });
});
