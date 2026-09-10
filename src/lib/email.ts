/**
 * NIVORA — E-mail transacional (Fase C / M7)
 * Provedor: Resend — plano gratuito verificado em 2026: 3.000 e-mails/mês, 100/dia, via API HTTP.
 * Config (segredos, nunca no wrangler.jsonc):
 *   RESEND_API_KEY  -> npx wrangler secret put RESEND_API_KEY
 *   RESEND_FROM     -> remetente verificado, ex.: "Nivora <nao-responder@nivora.app>"
 * Sem chave configurada o envio retorna { ok:false } e a rota mantém o comportamento atual
 * (token exposto só em dev http + mensagem genérica — sem vazar se o e-mail existe).
 */

function escapar(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function enviarEmail(
  env: any,
  para: string,
  assunto: string,
  html: string
): Promise<{ ok: boolean; erro?: string }> {
  const chave = env?.RESEND_API_KEY;
  if (!chave) return { ok: false, erro: 'EMAIL_NAO_CONFIGURADO' };
  const de = env?.RESEND_FROM || 'Nivora <onboarding@resend.dev>';
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${String(chave)}` },
      body: JSON.stringify({ from: de, to: [para], subject: assunto, html })
    });
    if (!r.ok) {
      return { ok: false, erro: `HTTP ${r.status}` };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, erro: String(e?.message || e) };
  }
}

export function htmlRecuperacao(usuario: unknown, link: string, appNome: string): string {
  const nome = escapar((usuario as any)?.nick || 'estudante');
  const url = escapar(link);
  const app = escapar(appNome || 'Nivora');
  return `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:0;background:#F1F5F9;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:520px;margin:0 auto;padding:32px 16px">
  <div style="background:#0B1220;color:#fff;padding:20px 24px;border-radius:16px 16px 0 0;font-size:20px;font-weight:700;letter-spacing:-0.02em">${app}</div>
  <div style="background:#ffffff;padding:24px;border-radius:0 0 16px 16px;color:#0F172A">
    <p style="margin:0 0 16px">Olá, <strong>${nome}</strong>!</p>
    <p style="margin:0 0 16px;line-height:1.6">Recebemos um pedido para redefinir a senha da sua conta na <strong>${app}</strong>. Para continuar, clique no botão abaixo (válido por 30 minutos):</p>
    <p style="margin:0 0 20px;text-align:center">
      <a href="${url}" style="display:inline-block;background:linear-gradient(135deg,#2D7FF9,#0EA67B);color:#ffffff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:999px">Redefinir minha senha</a>
    </p>
    <p style="margin:0 0 16px;font-size:13px;color:#64748B;line-height:1.6">Se o botão não funcionar, copie e cole este endereço no navegador:<br><span style="word-break:break-all">${url}</span></p>
    <p style="margin:0;font-size:13px;color:#64748B">Se você não pediu esta redefinição, ignore este e-mail — sua senha continua a mesma.</p>
  </div>
</div>
</body></html>`;
}
