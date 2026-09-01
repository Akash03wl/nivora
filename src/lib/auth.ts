/**
 * NIVORA — Auth (PBKDF2 via WebCrypto, sessões HttpOnly)
 */

const CHAVE_COOKIE = 'nivora_sessao';
const DURACAO_MS = 30 * 24 * 60 * 60 * 1000;

async function derivar(senha: string, salt: Uint8Array, iter: number): Promise<Uint8Array> {
  const mat = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: iter, hash: 'SHA-256' }, mat, 256);
  return new Uint8Array(bits);
}

function toHex(u: Uint8Array): string {
  return Array.from(u).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function fromHex(h: string): Uint8Array {
  const o = new Uint8Array(h.length / 2);
  for (let i = 0; i < o.length; i++) o[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return o;
}

export async function hashSenha(senha: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivar(senha, salt, 100000);
  return `pbkdf2$${toHex(salt)}$${toHex(hash)}`;
}

export async function verificarSenha(senha: string, armazenado: string): Promise<boolean> {
  if (!senha || !armazenado) return false;
  const partes = armazenado.split('$');
  if (partes.length !== 3 || partes[0] !== 'pbkdf2') return false;
  const salt = fromHex(partes[1]);
  const esperado = fromHex(partes[2]);
  const hash = await derivar(senha, salt, 100000);
  if (hash.length !== esperado.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash[i] ^ esperado[i];
  return diff === 0;
}

export function gerarToken(bytes = 32): string {
  return toHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function lerCookie(req: Request, nome: string): string | null {
  const c = req.headers.get('Cookie') || '';
  for (const p of c.split(';')) {
    const [k, ...r] = p.trim().split('=');
    if (k === nome) return decodeURIComponent(r.join('='));
  }
  return null;
}

export function cookieSessao(valor: string, secure: boolean): string {
  return `${CHAVE_COOKIE}=${valor}; Path=/; Max-Age=${Math.floor(DURACAO_MS / 1000)}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}
export function cookieExpirado(): string {
  return `${CHAVE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
}

export async function criarSessao(db: D1Database, userId: string): Promise<string> {
  const token = gerarToken(32);
  const expira = new Date(Date.now() + DURACAO_MS).toISOString();
  await db.prepare('INSERT INTO sessions (token, user_id, criado_em, expira_em) VALUES (?, ?, ?, ?)').bind(token, userId, new Date().toISOString(), expira).run();
  return token;
}

export async function usuarioDaSessao(db: D1Database, req: Request) {
  const token = lerCookie(req, CHAVE_COOKIE);
  if (!token) return null;
  const sess = await db.prepare('SELECT user_id FROM sessions WHERE token = ? AND expira_em > ?').bind(token, new Date().toISOString()).first<{ user_id: string }>();
  if (!sess) return null;
  const user = await db.prepare('SELECT id, nick, email, avatar, papel, status, criado_em FROM users WHERE id = ?').bind(sess.user_id).first();
  if (!user || (user as any).status === 'bloqueado') return null;
  return user;
}

export function ehAdmin(u: any): boolean { return !!u && u.papel === 'ADMIN'; }

export function perfilPublico(u: any) {
  return { id: u.id, nick: u.nick, email: u.email, avatar: u.avatar || null, papel: u.papel, criadoEm: u.criado_em };
}

export function isSecure(req: Request, env: any): boolean {
  const proto = new URL(req.url).protocol;
  return (env && env.ENVIRONMENT === 'production') || proto === 'https:';
}

export async function revogarSessao(db: D1Database, token: string | null) {
  if (!token) return;
  await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
}

export { CHAVE_COOKIE };
