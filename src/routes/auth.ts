import { Hono } from 'hono';
import { validarEmail, validarSenha, validarNick, limparTexto } from '../lib/validation.js';
import { hashSenha, verificarSenha, criarSessao, usuarioDaSessao, cookieSessao, cookieExpirado, isSecure, lerCookie, CHAVE_COOKIE, perfilPublico, ehAdmin, revogarSessao, gerarToken } from '../lib/auth.js';
import { primeira, executar, novoId } from '../lib/db.js';
import { checar } from '../lib/rateLimit.js';

type Env = { DB: D1Database; ENVIRONMENT: string; ADMIN_EMAIL?: string; ADMIN_PASSWORD?: string };

export const auth = new Hono<{ Bindings: Env }>();

// POST /api/auth/register
auth.post('/register', async (c) => {
  const db = c.env.DB;
  const req = c.req.raw;

  // rate limit 5/min
  const lim = await checar(db, req, 'register', 5, 60);
  if (!lim.ok) return c.json({ erro: 'Muitas contas criadas. Aguarde.' }, 429);

  let body: any = {};
  try { body = await c.req.json(); } catch {}
  const nickV = validarNick(body.nick);
  if (!nickV.ok) return c.json({ erro: nickV.erro }, 400);
  const emailV = validarEmail(body.email);
  if (!emailV.ok) return c.json({ erro: emailV.erro }, 400);
  const senhaV = validarSenha(body.senha);
  if (!senhaV.ok) return c.json({ erro: senhaV.erro }, 400);

  // nick único
  const nickExiste = await primeira(db, 'SELECT id FROM users WHERE lower(nick) = lower(?)', nickV.valor);
  if (nickExiste) return c.json({ erro: 'Nick já está em uso.' }, 409);
  const emailExiste = await primeira(db, 'SELECT id FROM users WHERE email = ?', emailV.valor);
  if (emailExiste) return c.json({ erro: 'Já existe conta com este e-mail.' }, 409);

  const id = 'u_' + novoId('');
  const hash = await hashSenha(senhaV.valor);

  // papel: primeiro usuário = ADMIN, ou se email bate com ADMIN_EMAIL
  const total = await primeira<{ c: number }>(db, 'SELECT COUNT(*) as c FROM users');
  const isFirst = !total || total.c === 0;
  const adminEmail = (c.env.ADMIN_EMAIL || '').toLowerCase().trim();
  const papel = (isFirst || (adminEmail && emailV.valor === adminEmail)) ? 'ADMIN' : 'USER';

  await executar(db, 'INSERT INTO users (id, nick, email, senha_hash, papel) VALUES (?, ?, ?, ?, ?)', id, nickV.valor, emailV.valor, hash, papel);

  const token = await criarSessao(db, id);
  const user = await primeira(db, 'SELECT id, nick, email, avatar, papel, criado_em FROM users WHERE id = ?', id);

  c.header('Set-Cookie', cookieSessao(token, isSecure(req, c.env)));
  return c.json({ usuario: perfilPublico(user) }, 201);
});

// POST /api/auth/login
auth.post('/login', async (c) => {
  const db = c.env.DB;
  const req = c.req.raw;
  const lim = await checar(db, req, 'login', 10, 60);
  if (!lim.ok) return c.json({ erro: 'Muitas tentativas. Aguarde.' }, 429);
  let body: any = {};
  try { body = await c.req.json(); } catch {}
  const emailV = validarEmail(body.email);
  if (!emailV.ok) return c.json({ erro: emailV.erro }, 400);
  const user: any = await primeira(db, 'SELECT id, nick, email, senha_hash, avatar, papel, status FROM users WHERE email = ?', emailV.valor);
  if (!user) return c.json({ erro: 'E-mail ou senha incorretos.' }, 401);
  if (user.status === 'bloqueado') return c.json({ erro: 'Conta bloqueada.' }, 403);
  const ok = await verificarSenha(String(body.senha || ''), user.senha_hash);
  if (!ok) return c.json({ erro: 'E-mail ou senha incorretos.' }, 401);
  await executar(db, 'UPDATE users SET ultimo_acesso = ? WHERE id = ?', new Date().toISOString(), user.id);
  const token = await criarSessao(db, user.id);
  c.header('Set-Cookie', cookieSessao(token, isSecure(req, c.env)));
  return c.json({ usuario: perfilPublico(user) });
});

// POST /api/auth/logout
auth.post('/logout', async (c) => {
  const token = lerCookie(c.req.raw, CHAVE_COOKIE);
  await revogarSessao(c.env.DB, token);
  c.header('Set-Cookie', cookieExpirado());
  return c.json({ ok: true });
});

// GET /api/auth/me
auth.get('/me', async (c) => {
  const user = await usuarioDaSessao(c.env.DB, c.req.raw);
  if (!user) return c.json({ erro: 'Não autenticado.' }, 401);
  return c.json({ usuario: perfilPublico(user) });
});

// PATCH /api/auth/me — alterar nick/avatar/senha
auth.patch('/me', async (c) => {
  const user = await usuarioDaSessao(c.env.DB, c.req.raw);
  if (!user) return c.json({ erro: 'Não autenticado.' }, 401);
  let body: any = {};
  try { body = await c.req.json(); } catch {}
  const sets: string[] = [];
  const params: unknown[] = [];
  if (body.nick !== undefined) {
    const v = validarNick(body.nick);
    if (!v.ok) return c.json({ erro: v.erro }, 400);
    const existe = await primeira(c.env.DB, 'SELECT id FROM users WHERE lower(nick)=lower(?) AND id != ?', v.valor, (user as any).id);
    if (existe) return c.json({ erro: 'Nick já em uso.' }, 409);
    sets.push('nick = ?'); params.push(v.valor);
  }
  if (body.avatar !== undefined) {
    const av = limparTexto(body.avatar, 8) || null;
    sets.push('avatar = ?'); params.push(av);
  }
  if (body.senhaAtual !== undefined || body.novaSenha !== undefined) {
    if (!body.senhaAtual || !body.novaSenha) return c.json({ erro: 'Informe senhaAtual e novaSenha.' }, 400);
    const atual: any = await primeira(c.env.DB, 'SELECT senha_hash FROM users WHERE id = ?', (user as any).id);
    const ok = await verificarSenha(String(body.senhaAtual), atual.senha_hash);
    if (!ok) return c.json({ erro: 'Senha atual incorreta.' }, 401);
    const v = validarSenha(body.novaSenha);
    if (!v.ok) return c.json({ erro: v.erro }, 400);
    const hash = await hashSenha(v.valor);
    sets.push('senha_hash = ?'); params.push(hash);
  }
  if (!sets.length) return c.json({ erro: 'Nada para atualizar.' }, 400);
  params.push((user as any).id);
  await executar(c.env.DB, `UPDATE users SET ${sets.join(', ')} WHERE id = ?`, ...params);
  const novo: any = await primeira(c.env.DB, 'SELECT id, nick, email, avatar, papel, criado_em FROM users WHERE id = ?', (user as any).id);
  return c.json({ usuario: perfilPublico(novo) });
});

// POST /api/auth/forgot — gerar token de recuperação (só expõe em dev http)
auth.post('/forgot', async (c) => {
  const db = c.env.DB;
  const req = c.req.raw;
  const lim = await checar(db, req, 'forgot', 5, 60);
  if (!lim.ok) return c.json({ erro: 'Muitas solicitações. Aguarde.' }, 429);
  let body: any = {};
  try { body = await c.req.json(); } catch {}
  const emailV = validarEmail(body.email);
  if (!emailV.ok) return c.json({ erro: emailV.erro }, 400);
  const user: any = await primeira(db, 'SELECT id FROM users WHERE email = ?', emailV.valor);
  if (!user) return c.json({ ok: true, mensagem: 'Se o e-mail existir, você receberá um link.' });
  const token = gerarToken(32);
  const expira = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  await executar(db, 'INSERT INTO password_resets (token, user_id, criado_em, expira_em) VALUES (?, ?, ?, ?)', token, user.id, new Date().toISOString(), expira);
  const isDev = c.env.ENVIRONMENT !== 'production';
  const isHttp = new URL(req.url).protocol === 'http:';
  return c.json({ ok: true, mensagem: 'Se o e-mail existir, você receberá um link.', ...(isDev && isHttp ? { tokenTeste: token } : {}) });
});

// POST /api/auth/reset — redefinir com token
auth.post('/reset', async (c) => {
  let body: any = {};
  try { body = await c.req.json(); } catch {}
  const token = String(body.token || '').trim();
  const v = validarSenha(body.novaSenha);
  if (!token) return c.json({ erro: 'Token inválido.' }, 400);
  if (!v.ok) return c.json({ erro: v.erro }, 400);
  const rec: any = await primeira(c.env.DB, 'SELECT user_id, usado, expira_em FROM password_resets WHERE token = ?', token);
  if (!rec || rec.usado || new Date(rec.expira_em) < new Date()) return c.json({ erro: 'Token expirado ou já usado.' }, 400);
  const hash = await hashSenha(v.valor);
  await executar(c.env.DB, 'UPDATE users SET senha_hash = ? WHERE id = ?', hash, rec.user_id);
  await executar(c.env.DB, 'UPDATE password_resets SET usado = 1 WHERE token = ?', token);
  await executar(c.env.DB, 'DELETE FROM sessions WHERE user_id = ?', rec.user_id);
  return c.json({ ok: true, mensagem: 'Senha redefinida. Faça login.' });
});

// GET /api/admin/ping — prova de proteção admin
auth.get('/admin/ping', async (c) => {
  const user = await usuarioDaSessao(c.env.DB, c.req.raw);
  if (!user) return c.json({ erro: 'Não autenticado.' }, 401);
  if (!ehAdmin(user)) return c.json({ erro: 'Acesso restrito a administradores.' }, 403);
  return c.json({ ok: true, papel: (user as any).papel });
});
