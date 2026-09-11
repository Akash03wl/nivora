import { Hono } from 'hono';
import { usuarioDaSessao } from '../lib/auth.js';
import { primeira, todas } from '../lib/db.js';
import { calcularPosicao } from '../lib/scoring.js';

type Env = { DB: D1Database };

export const history = new Hono<{ Bindings: Env }>();

// GET /api/me/history — lista de tentativas finalizadas do usuário
history.get('/history', async (c) => {
  const user = await usuarioDaSessao(c.env.DB, c.req.raw);
  if (!user) return c.json({ erro: 'Não autenticado.' }, 401);
  const lista = await todas(c.env.DB,
    `SELECT a.id, a.room_id, r.nome as room_nome, r.materia_id, a.acertos, a.erros, a.pontuacao, a.tempo_total, a.iniciado_em, a.finalizado_em,
            (SELECT COUNT(*) FROM questions WHERE room_id = a.room_id) as total
     FROM attempts a JOIN rooms r ON r.id = a.room_id
     WHERE a.user_id = ? AND a.status = 'finalizada'
     ORDER BY a.finalizado_em DESC LIMIT 100`, (user as any).id);
  // calcula posição e porcentagem por item
  const out = await Promise.all(lista.map(async (row: any) => {
    const total = Number(row.total) || (row.acertos + row.erros);
    const porcentagem = total ? Math.round(row.acertos / total * 100) : 0;
    // B17: posição única
    const rank = await todas(c.env.DB, 'SELECT acertos, pontuacao, tempo_total FROM attempts WHERE room_id = ? AND status = ? ORDER BY acertos DESC, pontuacao DESC, tempo_total ASC', row.room_id, 'finalizada');
    const pos = calcularPosicao(rank as any[], { acertos: row.acertos, pontuacao: row.pontuacao, tempo_total: row.tempo_total });
    return {
      attempt_id: row.id, room_id: row.room_id, room_nome: row.room_nome, materia_id: row.materia_id,
      acertos: row.acertos, total, porcentagem, pontuacao: row.pontuacao, tempo_total: row.tempo_total,
      iniciado_em: row.iniciado_em, finalizado_em: row.finalizado_em,
      posicao: pos, total_participantes: (rank as any[]).length
    };
  }));
  return c.json({ history: out });
});

// GET /api/me/stats — estatísticas agregadas
history.get('/stats', async (c) => {
  const user = await usuarioDaSessao(c.env.DB, c.req.raw);
  if (!user) return c.json({ erro: 'Não autenticado.' }, 401);
  const userId = (user as any).id;

  const totalSimulados = (await primeira<{ c:number }>(c.env.DB, 'SELECT COUNT(*) as c FROM attempts WHERE user_id = ? AND status = ?', userId, 'finalizada'))?.c || 0;
  const agg = await primeira<any>(c.env.DB, 'SELECT COALESCE(SUM(acertos),0) as acertos, COALESCE(SUM(acertos+erros),0) as total, COALESCE(SUM(pontuacao),0) as pontos, COALESCE(AVG(CASE WHEN (acertos+erros)>0 THEN 100.0*acertos/(acertos+erros) END),0) as media FROM attempts WHERE user_id = ? AND status = ?', userId, 'finalizada');
  const questoesRespondidas = Number(agg.total) || 0;
  const acertos = Number(agg.acertos) || 0;
  const media = Math.round(Number(agg.media) || 0);
  const taxa = questoesRespondidas ? Math.round(acertos/questoesRespondidas*100) : 0;
  const melhorPos = await primeira<any>(c.env.DB,
    `SELECT MIN(pos) as melhor FROM (
       SELECT a.id, (
         SELECT COUNT(*) FROM attempts b WHERE b.room_id = a.room_id AND b.status='finalizada' AND (b.acertos > a.acertos OR (b.acertos=a.acertos AND b.pontuacao > a.pontuacao) OR (b.acertos=a.acertos AND b.pontuacao=a.pontuacao AND b.tempo_total < a.tempo_total))
       )+1 as pos
       FROM attempts a WHERE a.user_id = ? AND a.status='finalizada'
     )`, userId);
  const melhorPosicao = melhorPos?.melhor ? Number(melhorPos.melhor) : null;
  const pontuacaoTotal = Number(agg.pontos) || 0;

  // por matéria
  const porMateriaRows = await todas(c.env.DB,
    `SELECT r.materia_id as materia, COALESCE(SUM(a.acertos),0) as acertos, COALESCE(SUM(a.acertos+a.erros),0) as total
     FROM attempts a JOIN rooms r ON r.id=a.room_id
     WHERE a.user_id=? AND a.status='finalizada' GROUP BY r.materia_id`, userId);
  const porMateria: Record<string, { acertos:number; total:number; taxa:number }> = {};
  for (const r of porMateriaRows as any[]) {
    const total = Number(r.total);
    porMateria[r.materia || 'geral'] = { acertos: Number(r.acertos), total, taxa: total ? Math.round(Number(r.acertos)/total*100) : 0 };
  }

  // por assunto (via questions.assunto)
  const porAssuntoRows = await todas(c.env.DB,
    `SELECT q.assunto as assunto, SUM(CASE WHEN ans.correta=1 THEN 1 ELSE 0 END) as acertos, COUNT(*) as total
     FROM answers ans JOIN attempts a ON a.id=ans.attempt_id JOIN questions q ON q.id=ans.question_id
     WHERE a.user_id=? AND a.status='finalizada' GROUP BY q.assunto`, userId);
  const porAssunto: Record<string, { acertos:number; total:number; taxa:number }> = {};
  for (const r of porAssuntoRows as any[]) {
    const total = Number(r.total);
    porAssunto[r.assunto || 'geral'] = { acertos: Number(r.acertos), total, taxa: total ? Math.round(Number(r.acertos)/total*100) : 0 };
  }

  return c.json({
    totalSimulados, questoesRespondidas, acertos, mediaAproveitamento: media, taxaAcerto: taxa,
    melhorPosicao, pontuacaoTotal,
    porMateria, porAssunto
  });
});
