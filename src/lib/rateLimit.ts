/**
 * NIVORA — Rate limit baseado em D1 (janela por IP+rota)
 */

export function ipDaReq(req: Request): string {
  const cf = req.headers.get('CF-Connecting-IP');
  if (cf) return cf.split(',')[0].trim();
  const xff = req.headers.get('X-Forwarded-For');
  if (xff) return xff.split(',')[0].trim();
  return 'unknown';
}

export async function checar(
  db: D1Database,
  req: Request,
  rotulo: string,
  limite: number,
  janelaS: number,
  userId?: string
): Promise<{ ok: boolean; tentaDeNovoEm?: number }> {
  // B16: para rotas autenticadas, usar userId em vez de IP para não bloquear turma na mesma rede
  const chaveBase = userId ? `user:${userId}` : ipDaReq(req);
  const agora = Math.floor(Date.now() / 1000);
  const janelaAtual = Math.floor(agora / janelaS) * janelaS;
  const chave = `rl:${chaveBase}:${rotulo}`;
  try {
    // One conditional UPSERT prevents concurrent requests from resetting/lossily incrementing the counter.
    const result = await db.prepare(`INSERT INTO rate_limit (chave, contagem, janela_expira) VALUES (?, 1, ?)
      ON CONFLICT(chave) DO UPDATE SET
        contagem = CASE WHEN rate_limit.janela_expira = excluded.janela_expira THEN rate_limit.contagem + 1 ELSE 1 END,
        janela_expira = excluded.janela_expira
      WHERE rate_limit.janela_expira != excluded.janela_expira OR rate_limit.contagem < ?`).bind(chave, janelaAtual, limite).run();
    return Number(result.meta.changes) > 0 ? { ok: true } : { ok: false, tentaDeNovoEm: janelaAtual + janelaS - agora };
  } catch {
    return { ok: false, tentaDeNovoEm: janelaS };
  }
}
