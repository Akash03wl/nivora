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
  janelaS: number
): Promise<{ ok: boolean; tentaDeNovoEm?: number }> {
  const ip = ipDaReq(req);
  const agora = Math.floor(Date.now() / 1000);
  const janelaAtual = Math.floor(agora / janelaS) * janelaS;
  const chave = `rl:${ip}:${rotulo}`;
  try {
    const linha = await db.prepare('SELECT contagem, janela_expira FROM rate_limit WHERE chave = ?').bind(chave).first<{ contagem: number; janela_expira: number }>();
    if (!linha || Number(linha.janela_expira) !== janelaAtual) {
      await db.prepare('INSERT INTO rate_limit (chave, contagem, janela_expira) VALUES (?, 1, ?) ON CONFLICT(chave) DO UPDATE SET contagem = 1, janela_expira = excluded.janela_expira').bind(chave, janelaAtual).run();
      return { ok: true };
    }
    const contagem = Number(linha.contagem) + 1;
    if (contagem > limite) {
      return { ok: false, tentaDeNovoEm: janelaAtual + janelaS - agora };
    }
    await db.prepare('UPDATE rate_limit SET contagem = ? WHERE chave = ?').bind(contagem, chave).run();
    return { ok: true };
  } catch {
    return { ok: true };
  }
}
