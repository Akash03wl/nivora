// NIVORA — frontend (SPA)
// Fases: Auth, Salas, Admin, Execução (M1), Resultado (M2), Ranking (M3),
// Histórico (M4), Revisão admin (M5), Código (M6), Quantidade (M8), Tema (M9), Perfil (M10), Recuperar senha (Fase C).
// Tela inicial rica: módulos pequenos e puros (js/icones.js, js/faq.js).
import { ICONES } from './icones.js';
import { PERGUNTAS_FAQ, proximaFaqAberta, formatarContagem } from './faq.js';

function escapeHTML(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const $ = (id) => document.getElementById(id);
function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }
async function api(url, opcoes = {}) {
  const r = await fetch(url, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...opcoes });
  let d = {};
  try { d = await r.json(); } catch { /* sem corpo */ }
  return { r, d };
}
function letras(i) { return String.fromCharCode(65 + i); }
function fmtTempo(s) {
  s = Math.max(0, Math.floor(s || 0));
  const m = Math.floor(s / 60), seg = s % 60;
  return `${m}:${String(seg).padStart(2, '0')}`;
}
function fmtData(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function parseAssuntos(s) {
  if (Array.isArray(s)) return s;              // a API já devolve array
  try { return JSON.parse(s || '[]'); } catch { return []; }
}

// ---------------------------------------------------------------- Estado global
let usuario = null;          // perfil atual ou null
let adminLogado = false;
let salasCache = [];         // lista pública da home
let acaoPendente = null;     // ()=>void a executar após login
let exame = null;            // estado da execução
let revisao = null;          // { roomId, roomNome, questoes } painel admin
let temaAtual = null;

// ---------------------------------------------------------------- Hero: prévia de progresso (plataforma de estudo, não quiz)
async function renderProgressoPreview() {
  const barrasEl = $('pp-barras');
  const fraseEl = $('pp-frase');
  if (!barrasEl || !fraseEl) return;
  if (!usuario) {
    barrasEl.innerHTML = '';
    fraseEl.innerHTML = 'Entre para acompanhar seu progresso por assunto e descobrir o que revisar antes da próxima prova.';
    return;
  }
  barrasEl.innerHTML = `<div class="state state-loading"><span class="spinner"></span> Carregando…</div>`;
  fraseEl.textContent = '';
  try {
    const { r, d } = await api('/api/me/stats');
    if (!r.ok) throw new Error('stats');
    const st = d || {};
    const porMateria = st.porMateria || {};
    const porAssunto = st.porAssunto || {};
    const materias = Object.entries(porMateria).sort((a, b) => (b[1].taxa || 0) - (a[1].taxa || 0)).slice(0, 3);
    if (!materias.length) {
      barrasEl.innerHTML = '';
      fraseEl.innerHTML = 'Você ainda não finalizou nenhum simulado. Comece o primeiro e acompanhe sua evolução aqui.';
      return;
    }
    barrasEl.innerHTML = materias.map(([nome, v]) => `
      <div class="pp-barra">
        <div class="pp-barra-topo"><span>${escapeHTML(nome)}</span><span class="num">${v.taxa}%</span></div>
        <div class="barra"><div class="barra-preenchida" style="width:${Math.max(0, Math.min(100, v.taxa))}%"></div></div>
      </div>`).join('');
    const piores = Object.entries(porAssunto).filter(([, v]) => (v.total || 0) > 0).sort((a, b) => a[1].taxa - b[1].taxa);
    if (piores.length) {
      const [assunto, v] = piores[0];
      fraseEl.innerHTML = `Seu ponto mais fraco agora é <strong>${escapeHTML(assunto)}</strong> (${v.taxa}% de acerto) — considere revisar antes da próxima prova.`;
    } else {
      fraseEl.innerHTML = 'Continue praticando para manter sua evolução.';
    }
  } catch {
    barrasEl.innerHTML = '';
    fraseEl.innerHTML = 'Não foi possível carregar seu progresso agora.';
  }
}

// ---------------------------------------------------------------- Views (troca de seção)
const secHero = document.querySelector('.hero');
const secSalas = $('salas');
const secAdmin = $('admin');
const secViews = ['execucao', 'resultado', 'ranking', 'historico'].map((id) => $(id));

function mostrarHome(rolarPara = null) {
  document.body.classList.remove('em-prova');
  secHero.style.display = '';
  secSalas.style.display = '';
  secViews.forEach((v) => { if (v) v.style.display = 'none'; });
  secAdmin.style.display = adminLogado ? '' : 'none';
  if (rolarPara) { const el = $(rolarPara); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}
function mostrarView(id) {
  secHero.style.display = 'none';
  secSalas.style.display = 'none';
  secAdmin.style.display = 'none';
  secViews.forEach((v) => { if (v) v.style.display = v.id === id ? '' : 'none'; });
  document.body.classList.toggle('em-prova', id === 'execucao');
  window.scrollTo({ top: 0 });
}

// ---------------------------------------------------------------- Tema (M9)
function aplicarTema(tema) {
  temaAtual = tema;
  document.documentElement.dataset.theme = tema;
  const b = $('btn-tema');
  if (b) { b.textContent = tema === 'light' ? '☀️' : '🌙'; b.title = tema === 'light' ? 'Mudar para tema escuro' : 'Mudar para tema claro'; }
}
function temaSalvo() { try { return localStorage.getItem('nivora-tema'); } catch { return null; } }
function initTema() {
  const salvo = temaSalvo();
  if (salvo === 'light' || salvo === 'dark') { aplicarTema(salvo); return; }
  // data-theme="system" inicial → resolve pela preferência do SO
  const escuro = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  aplicarTema(escuro ? 'dark' : 'light');
}
$('btn-tema')?.addEventListener('click', () => {
  const novo = temaAtual === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem('nivora-tema', novo); } catch { /* ignora */ }
  aplicarTema(novo);
});

// ---------------------------------------------------------------- Tela de entrada rica (dentro do login obrigatório)
// Texto pronto do PROMPT "TELA INICIAL MAIS RICA" — sem placeholder.
const PASSOS = [
  { icone: 'entrar', titulo: 'Entre em uma sala', texto: 'Veja as salas abertas e o assunto de cada uma. Escolha o simulado que combina com a prova que você tem pela frente.' },
  { icone: 'ritmo', titulo: 'Responda no seu ritmo', texto: 'As questões foram geradas e revisadas especialmente pra aquele assunto. Você responde quando quiser, sem ninguém esperando por você.' },
  { icone: 'entender', titulo: 'Entenda cada resposta', texto: 'Errou uma questão? A explicação aparece ao finalizar o simulado — o objetivo é entender o motivo, não só saber que errou.' },
  { icone: 'evolucao', titulo: 'Acompanhe sua evolução', texto: 'Veja seu progresso por assunto, descubra onde ainda precisa revisar e compare seu desempenho com o da turma.' }
];
const VALORES = [
  { icone: 'revisadas', titulo: 'Questões revisadas, não só geradas', texto: 'A IA cria as perguntas, mas elas passam por uma checagem antes de a sala abrir — pra você não perder tempo estudando por um gabarito errado.' },
  { icone: 'tempo', titulo: 'Cada um no seu tempo', texto: 'Sem sala de aula sincronizada, sem esperar todo mundo terminar. Você entra quando quiser e vê seu resultado assim que termina.' },
  { icone: 'explicado', titulo: 'Erro explicado, não só marcado', texto: 'Toda resposta errada vem com uma explicação — é aí que o estudo realmente acontece.' },
  { icone: 'progresso', titulo: 'Progresso por assunto', texto: 'Não é só uma nota final. Você vê exatamente onde está bem e onde ainda precisa revisar.' }
];

function renderizarConteudoEntrada() {
  const passosEl = $('passos-lista');
  if (passosEl) {
    passosEl.innerHTML = PASSOS.map((p, i) => `
      <li class="passo">
        <span class="passo-icone" aria-hidden="true">${ICONES[p.icone]}</span>
        <div class="passo-corpo">
          <span class="passo-num">Passo ${i + 1}</span>
          <h3>${escapeHTML(p.titulo)}</h3>
          <p>${escapeHTML(p.texto)}</p>
        </div>
      </li>`).join('');
  }
  const valoresEl = $('valores-grid');
  if (valoresEl) {
    valoresEl.innerHTML = VALORES.map((v) => `
      <article class="valor">
        <span class="valor-icone" aria-hidden="true">${ICONES[v.icone]}</span>
        <h3>${escapeHTML(v.titulo)}</h3>
        <p>${escapeHTML(v.texto)}</p>
      </article>`).join('');
  }
  const faqEl = $('faq-lista');
  if (faqEl) {
    faqEl.innerHTML = PERGUNTAS_FAQ.map((f) => `
      <div class="faq-item">
        <button type="button" class="faq-pergunta" id="faq-btn-${escapeHTML(f.id)}" aria-expanded="false" aria-controls="faq-resp-${escapeHTML(f.id)}">
          <span>${escapeHTML(f.pergunta)}</span>
          <svg class="faq-seta" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
        </button>
        <div class="faq-resposta" id="faq-resp-${escapeHTML(f.id)}" role="region" aria-labelledby="faq-btn-${escapeHTML(f.id)}" hidden>${escapeHTML(f.resposta)}</div>
      </div>`).join('');
    let faqAberta = null;
    faqEl.querySelectorAll('.faq-pergunta').forEach((btn) => {
      btn.addEventListener('click', () => {
        const alvo = btn.id.replace('faq-btn-', '');
        faqAberta = proximaFaqAberta(faqAberta, alvo);
        faqEl.querySelectorAll('.faq-item').forEach((item) => {
          const b = item.querySelector('.faq-pergunta');
          const aberto = b.id.replace('faq-btn-', '') === faqAberta;
          b.setAttribute('aria-expanded', String(aberto));
          item.classList.toggle('aberto', aberto);
          item.querySelector('.faq-resposta').hidden = !aberto;
        });
      });
    });
  }
}

// Contagem real de salas abertas (GET /api/rooms continua público na API).
// Falhou ou veio vazia? A linha some graciosamente — nunca quebra a tela.
let loginStatsFeito = false;
async function carregarLoginStats() {
  const el = $('login-stats');
  if (!el || loginStatsFeito) return;
  loginStatsFeito = true;
  try {
    const { r, d } = await api('/api/rooms');
    if (!r.ok) throw new Error('rooms');
    const abertas = (d.rooms || []).filter((s) => s.status === 'ACTIVE').length;
    el.textContent = abertas
      ? `${formatarContagem(abertas, 'sala aberta', 'salas abertas')} agora — escolha a sua e comece.`
      : 'Nenhuma sala aberta no momento — volte em breve ou peça a um administrador para publicar um simulado.';
  } catch {
    el.style.display = 'none';
  }
}

// ---------------------------------------------------------------- Auth modal (login/registro)
let modo = 'login';
const form = $('auth-form');
const nickEl = $('auth-nick');
const emailEl = $('auth-email');
const senhaEl = $('auth-senha');
const msgEl = $('auth-msg');

function setModo(m) {
  modo = m;
  const isLogin = m === 'login';
  $('auth-title').textContent = isLogin ? 'Entre para começar a estudar' : 'Crie sua conta e comece a estudar';
  nickEl.style.display = isLogin ? 'none' : 'block';
  nickEl.required = !isLogin;
  $('auth-submit').textContent = isLogin ? 'Entrar' : 'Criar conta';
  const tl = $('tab-login'), tr = $('tab-register');
  tl.classList.toggle('ativo', isLogin);
  tr.classList.toggle('ativo', !isLogin);
  tl.setAttribute('aria-selected', String(isLogin));
  tr.setAttribute('aria-selected', String(!isLogin));
  msgEl.textContent = '';
  msgEl.style.color = 'var(--error)';
}
$('tab-login')?.addEventListener('click', () => setModo('login'));
$('tab-register')?.addEventListener('click', () => setModo('register'));
$('btn-comecar')?.addEventListener('click', () => {
  if (!usuario) { mostrarLogin(); return; }
  limparExecucao();
  mostrarHome('salas');
  carregarSalas();
});
$('link-esqueci')?.addEventListener('click', (e) => {
  e.preventDefault();
  $('esqueci-dialog').showModal();
});

async function refreshAuth() {
  try {
    const { r, d } = await api('/api/auth/me');
    const area = $('auth-area');
    if (!area) return;
    if (r.ok) {
      usuario = d.usuario;
      adminLogado = usuario.papel === 'ADMIN';
      const elNick = escapeHTML(usuario.nick);
      const avatar = usuario.avatar ? escapeHTML(usuario.avatar) : '';
      area.innerHTML = `
        <span class="auth-info">${avatar ? escapeHTML(avatar) + ' ' : ''}Olá, <strong>${elNick}</strong> · ${escapeHTML(usuario.papel)}</span>
        <button id="btn-perfil" class="btn btn-ghost" style="padding:6px 12px; font-size:0.85rem">Perfil</button>
        <button id="btn-logout" class="btn btn-ghost" style="padding:6px 12px; font-size:0.85rem">Sair</button>`;
      $('btn-perfil')?.addEventListener('click', abrirPerfil);
      $('btn-logout')?.addEventListener('click', sair);
      renderProgressoPreview();
      $('nav-historico').style.display = '';
      if (adminLogado) {
        $('nav-admin').style.display = '';
        secAdmin.style.display = '';
        carregarAdmin();
        popularMaterias();
      } else {
        $('nav-admin').style.display = 'none';
        secAdmin.style.display = 'none';
      }
    } else {
      // Sem sessão: a tela de login obrigatória cobre tudo (nada de botão "Entrar" solto na navbar).
      usuario = null; adminLogado = false;
      if (area) area.innerHTML = '';
      $('nav-admin').style.display = 'none';
      $('nav-historico').style.display = 'none';
    }
  } catch {
    usuario = null; adminLogado = false;
    const area = $('auth-area');
    if (area) area.innerHTML = '';
  }
  renderProgressoPreview();
}
function carregarAdminLimpar() {
  const g = $('admin-grid');
  if (g) g.innerHTML = '';
  $('admin').style.display = 'none';
  $('nav-admin').style.display = 'none';
  fecharRevisao(false);
}

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  msgEl.textContent = '';
  msgEl.style.color = 'var(--error)';
  const payload = modo === 'login'
    ? { email: emailEl.value.trim(), senha: senhaEl.value }
    : { nick: nickEl.value.trim(), email: emailEl.value.trim(), senha: senhaEl.value };
  const url = modo === 'login' ? '/api/auth/login' : '/api/auth/register';
  try {
    const { r, d } = await api(url, { method: 'POST', body: JSON.stringify(payload) });
    if (!r.ok) { msgEl.textContent = d.erro || 'Erro'; return; }
    form.reset();
    await refreshAuth();
    entrarNoSite();
    if (acaoPendente) { const fn = acaoPendente; acaoPendente = null; try { await fn(); } catch { /* ignora */ } }
  } catch {
    msgEl.textContent = 'Falha de rede';
  }
});

// ---------------------------------------------------------------- Esqueci / Resetar senha (Fase C)
$('esqueci-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const m = $('esqueci-msg');
  m.textContent = 'Enviando...';
  m.style.color = 'var(--muted)';
  try {
    const { r, d } = await api('/api/auth/forgot', { method: 'POST', body: JSON.stringify({ email: $('esqueci-email').value.trim() }) });
    if (!r.ok) { m.textContent = d.erro || 'Erro'; m.style.color = 'var(--error)'; return; }
    m.textContent = d.mensagem || 'Verifique seu e-mail.';
    m.style.color = 'var(--success)';
    if (d.tokenTeste) {
      m.innerHTML = `${escapeHTML(d.mensagem || '')}<br><br><small><strong>Modo desenvolvimento</strong> — link de teste:<br><a href="/?resetar=${encodeURIComponent(d.tokenTeste)}" style="color:var(--primary)">/?resetar=${escapeHTML(d.tokenTeste.slice(0, 16))}…</a></small>`;
    }
  } catch {
    m.textContent = 'Falha de rede';
    m.style.color = 'var(--error)';
  }
});

let tokenReset = null;
function abrirReset(token) {
  tokenReset = token;
  $('reset-form').reset();
  $('reset-msg').textContent = '';
  $('reset-dialog').showModal();
}
$('reset-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const m = $('reset-msg');
  m.style.color = 'var(--error)';
  const nova = $('reset-senha').value;
  if (nova !== $('reset-confirma').value) { m.textContent = 'As senhas não conferem.'; return; }
  if (!tokenReset) { m.textContent = 'Token de recuperação ausente. Peça um novo link.'; return; }
  m.textContent = 'Redefinindo...';
  m.style.color = 'var(--muted)';
  try {
    const { r, d } = await api('/api/auth/reset', { method: 'POST', body: JSON.stringify({ token: tokenReset, novaSenha: nova }) });
    if (!r.ok) { m.textContent = d.erro || 'Erro'; return; }
    m.textContent = 'Senha redefinida! Faça login com a nova senha.';
    m.style.color = 'var(--success)';
    setTimeout(() => {
      $('reset-dialog').close();
      mostrarLogin();
    }, 1600);
  } catch {
    m.textContent = 'Falha de rede';
  }
});

// ---------------------------------------------------------------- Perfil (M10)
function abrirPerfil() {
  if (!usuario) return;
  $('perfil-email').textContent = `E-mail: ${escapeHTML(usuario.email)} · Criado em ${fmtData(usuario.criadoEm)}`;
  $('perfil-nick').value = usuario.nick || '';
  $('perfil-avatar').value = usuario.avatar || '';
  $('perfil-senha-atual').value = '';
  $('perfil-senha-nova').value = '';
  const m = $('perfil-msg');
  m.textContent = '';
  $('perfil-dialog').showModal();
}
$('perfil-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const m = $('perfil-msg');
  m.style.color = 'var(--error)';
  const payload = {
    nick: $('perfil-nick').value.trim(),
    avatar: $('perfil-avatar').value.trim()
  };
  const senhaAtual = $('perfil-senha-atual').value;
  const novaSenha = $('perfil-senha-nova').value;
  if (senhaAtual || novaSenha) {
    if (!senhaAtual || !novaSenha) { m.textContent = 'Para trocar a senha informe a atual e a nova.'; return; }
    payload.senhaAtual = senhaAtual;
    payload.novaSenha = novaSenha;
  }
  try {
    const { r, d } = await api('/api/auth/me', { method: 'PATCH', body: JSON.stringify(payload) });
    if (!r.ok) { m.textContent = d.erro || 'Erro'; return; }
    m.textContent = 'Perfil atualizado!';
    m.style.color = 'var(--success)';
    refreshAuth();
    setTimeout(() => $('perfil-dialog').close(), 1200);
  } catch {
    m.textContent = 'Falha de rede';
  }
});

// ---------------------------------------------------------------- Home: salas + código
async function carregarSalas() {
  const grid = $('salas-grid');
  const statusEl = $('salas-status');
  const errorEl = $('salas-error');
  const emptyEl = $('salas-empty');
  if (!grid) return;
  if (statusEl) statusEl.textContent = 'Carregando...';
  if (errorEl) errorEl.style.display = 'none';
  if (emptyEl) emptyEl.style.display = 'none';
  grid.innerHTML = `<div class="card skeleton" style="height:120px"></div><div class="card skeleton" style="height:120px"></div><div class="card skeleton" style="height:120px"></div>`;
  try {
    const { r, d } = await api('/api/rooms');
    if (!r.ok) throw new Error('Falha ao carregar salas');
    const rooms = d.rooms || [];
    salasCache = rooms;
    if (statusEl) statusEl.textContent = `${rooms.length} sala(s)`;
    if (!rooms.length) {
      grid.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }
    grid.innerHTML = rooms.map((s) => {
      const assuntos = parseAssuntos(s.assuntos).map((a) => escapeHTML(a)).join(', ');
      const difLabel = { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil', muito_dificil: 'Muito difícil', personalizado: 'Personalizado' }[s.dificuldade] || s.dificuldade;
      const ativa = s.status === 'ACTIVE';
      const fechada = s.status === 'CLOSED';
      const statusCls = fechada ? 'badge' : 'badge';
      const botao = ativa
        ? `<button class="btn btn-primary" style="width:100%; margin-top:auto" data-acao="entrar" data-room="${escapeHTML(s.id)}">Começar simulado</button>`
        : `<button class="btn btn-ghost" style="width:100%; margin-top:auto; opacity:0.6; cursor:not-allowed" disabled>${fechada ? 'Encerrada' : 'Disponível em breve'}</button>`;
      return `
      <div class="card" style="display:flex; flex-direction:column; gap:8px">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; flex-wrap:wrap">
          <span class="${statusCls}">${s.status} · ${escapeHTML(difLabel)}</span>
          ${s.codigo ? `<code class="mono" style="color:var(--muted); font-size:0.75rem" aria-label="Código da sala">#${escapeHTML(s.codigo)}</code>` : ''}
        </div>
        <strong class="font-title" style="font-size:1.05rem">${escapeHTML(s.nome)}</strong>
        <small style="color:var(--muted); line-height:1.4">${escapeHTML(s.descricao) || 'Sem descrição'}</small>
        <small class="mono" style="color:var(--muted); font-size:0.8rem">${s.quantidade} questões · ${s.tempo_por_questao === 0 ? 'sem limite de tempo' : s.tempo_por_questao + 's/questão'} · ${assuntos || 'geral'}</small>
        <div style="display:flex; gap:8px; margin-top:auto">
          ${botao}
          <button class="btn btn-ghost" style="width:auto" data-acao="ranking" data-room="${escapeHTML(s.id)}" aria-label="Ver ranking de ${escapeHTML(s.nome)}">Ranking</button>
        </div>
      </div>`;
    }).join('');
  } catch {
    grid.innerHTML = '';
    if (statusEl) statusEl.textContent = 'Erro';
    if (errorEl) { errorEl.textContent = 'Erro ao carregar salas. Verifique sua conexão e tente novamente.'; errorEl.style.display = 'block'; }
  }
}

// delegação de cliques na grade de salas
$('salas-grid')?.addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-acao]');
  if (!btn) return;
  const id = btn.dataset.room;
  const sala = salasCache.find((s) => s.id === id);
  if (btn.dataset.acao === 'entrar') {
    if (sala && sala.status === 'ACTIVE') { tryEntrar(id, sala.nome); }
    else if (sala) { mostrarAviso(sala.status === 'CLOSED' ? 'Esta sala está encerrada.' : 'Esta sala ainda não foi aberta. Aguarde o administrador ativá-la.'); }
  } else if (btn.dataset.acao === 'ranking') {
    abrirRanking(id);
  }
});

// Entrar com código (M6)
$('btn-codigo')?.addEventListener('click', entrarPorCodigo);
$('codigo-input')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') entrarPorCodigo(); });
async function entrarPorCodigo() {
  const input = $('codigo-input');
  const msg = $('codigo-msg');
  const codigo = (input.value || '').trim().toUpperCase();
  if (!codigo) return;
  msg.textContent = 'Buscando sala...';
  try {
    const { r, d } = await api(`/api/rooms/by-code/${encodeURIComponent(codigo)}`);
    if (!r.ok) { msg.textContent = d.erro || 'Código não encontrado.'; return; }
    const room = d.room;
    msg.textContent = '';
    if (room.status !== 'ACTIVE') {
      mostrarAviso(room.status === 'PUBLISHED' ? `A sala "${room.nome}" ainda não foi aberta.` : room.status === 'CLOSED' ? `A sala "${room.nome}" já foi encerrada.` : 'Sala indisponível.');
      return;
    }
    tryEntrar(room.id, room.nome);
  } catch {
    msg.textContent = 'Falha de rede.';
  }
}
function mostrarAviso(texto) {
  const v = $('exec-aviso');
  v.textContent = texto;
  v.style.display = 'block';
  setTimeout(() => { v.style.display = 'none'; }, 5000);
}

// ---------------------------------------------------------------- Execução do simulado (M1 / B3)
function pararTimer() {
  if (exame && exame.timer) { clearInterval(exame.timer); exame.timer = null; }
}
function limparExecucao() {
  pararTimer();
  exame = null;
}
$('exec-sair')?.addEventListener('click', () => {
  const emAndamento = exame && exame.questoes.length > exame.atual;
  limparExecucao();
  mostrarHome();
  if (emAndamento) mostrarAviso('Tentativa pausada — você pode retomar depois clicando em "Começar simulado" na sala.');
});

function exigirLogin(fn) {
  acaoPendente = fn;
  mostrarLogin();
}

async function tryEntrar(roomId, roomNome) {
  if (!usuario) {
    exigirLogin(() => tryEntrar(roomId, roomNome));
    return;
  }
  $('exec-aviso').style.display = 'none';
  try {
    // inicia (ou retoma) a tentativa
    const { r, d } = await api(`/api/rooms/${roomId}/start`, { method: 'POST' });
    if (r.status === 401) { limparExecucao(); mostrarLogin('Sessão expirada. Entre novamente para continuar.'); return; }
    if (r.status === 201 || (r.status === 200 && d.retomada)) {
      iniciarExecucao(roomId, roomNome, d.questoes || [], d.retomada === true, d.attempt);
      return;
    }
    if (r.status === 409) {
      // já finalizou? tenta mostrar o resultado; senão, mostra o erro amigável
      const res = await api(`/api/rooms/${roomId}/result`);
      if (res.r.ok) { carregarResultado(roomId, roomNome); return; }
      mostrarAviso(d.erro || 'Não foi possível iniciar o simulado.');
      return;
    }
    mostrarAviso(d.erro || 'Não foi possível iniciar o simulado.');
  } catch {
    mostrarAviso('Falha de rede ao iniciar o simulado.');
  }
}

async function iniciarExecucao(roomId, roomNome, questoes, retomada, attempt) {
  exame = {
    roomId, roomNome,
    questoes: questoes || [],
    atual: 0,
    limiteS: Number(questoes[0]?.tempo_por_questao) || 0,
    respondidas: new Set(),
    sel: null,
    enviando: false,
    timer: null,
    restante: 0,
    inicioQuestao: Date.parse(attempt?.ultima_resposta_em || attempt?.iniciado_em) || Date.now()
  };
  mostrarView('execucao');
  $('exec-titulo').textContent = roomNome;
  if (retomada) {
    // descobre quais questões já foram respondidas
    try {
      const { r, d } = await api(`/api/rooms/${roomId}/attempt`);
      if (r.ok) {
        exame.inicioQuestao = Date.parse(d.attempt?.ultima_resposta_em || d.attempt?.iniciado_em) || exame.inicioQuestao;
        (d.attempt?.respondidas || []).forEach((qid) => exame.respondidas.add(qid));
      } else { throw new Error('Estado indisponível'); }
    } catch { limparExecucao(); mostrarHome(); mostrarAviso('Não foi possível retomar suas respostas. Tente novamente.'); return; }
    const primeira = questoes.findIndex((q) => !exame.respondidas.has(q.id));
    if (primeira === -1) {
      // todas respondidas mas tentativa não finalizada → finaliza e mostra resultado
      exame.atual = questoes.length;
      await finalizarSimulado();
      return;
    }
    exame.atual = primeira;
  }
  renderQuestao();
}

function renderQuestao() {
  if (!exame || !exame.questoes.length) return;
  pararTimer();
  const q = exame.questoes[exame.atual];
  if (!q) { finalizarSimulado(); return; }
  exame.sel = null;
  exame.enviando = false;
  const total = exame.questoes.length;
  const difLabel = { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil', muito_dificil: 'Muito difícil', personalizado: 'Personalizado' }[q.dificuldade] || q.dificuldade;
  const pct = Math.round(((exame.atual) / total) * 100);
  $('exec-progresso').innerHTML = `<span class="mono" style="color:var(--muted)">${escapeHTML(difLabel)}${q.assunto ? ' · ' + escapeHTML(q.assunto) : ''}</span>`;
  const card = $('exec-card');
  card.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:baseline; gap:10px; margin-bottom:8px">
      <span class="mono" style="color:var(--muted); font-size:0.85rem">Questão ${exame.atual + 1} de ${total}</span>
      <span class="mono" style="color:var(--muted); font-size:0.8rem">${Math.round(((exame.atual) / total) * 100)}%</span>
    </div>
    <div class="barra-progresso" style="margin-bottom:22px" aria-hidden="true"><div style="width:${pct}%"></div></div>
    <p class="font-title" style="font-size:clamp(1.15rem,2.4vw,1.5rem); line-height:1.4; margin-bottom:20px">${escapeHTML(q.enunciado)}</p>
    <div style="display:flex; flex-direction:column; gap:10px">
      ${q.alternativas.map((alt, i) => `
        <button class="opcao" aria-pressed="false" data-idx="${i}" style="text-align:left">
          <span class="opcao-letra">${letras(i)}</span>
          <span>${escapeHTML(alt)}</span>
        </button>`).join('')}
    </div>
    <div class="exec-acoes">
      <button class="btn btn-primary" id="exec-confirmar" disabled>Confirmar resposta</button>
      <button class="btn btn-ghost" id="exec-pular">Pular questão</button>
    </div>`;
  card.querySelectorAll('.opcao').forEach((b) => {
    b.addEventListener('click', () => {
      card.querySelectorAll('.opcao').forEach((x) => { x.classList.remove('sel'); x.setAttribute('aria-pressed', 'false'); });
      b.classList.add('sel');
      b.setAttribute('aria-pressed', 'true');
      exame.sel = Number(b.dataset.idx);
      $('exec-confirmar').disabled = false;
    });
  });
  $('exec-confirmar').addEventListener('click', () => { if (exame.sel !== null) enviarResposta(exame.sel); });
  $('exec-pular').addEventListener('click', () => enviarResposta(null));
  iniciarTimerQuestao();
}

function iniciarTimerQuestao() {
  const el = $('exec-timer');
  if (!exame || !el) return;
  const limite = exame.limiteS || 0;
  if (!limite) { el.textContent = '⏱ Sem limite'; return; }
  exame.restante = Math.max(0, limite - Math.floor((Date.now() - exame.inicioQuestao) / 1000));
  el.textContent = `⏱ ${fmtTempo(exame.restante)}`;
  el.classList.remove('urgente');
  exame.timer = setInterval(() => {
    if (!exame) return;
    exame.restante = Math.max(0, limite - Math.floor((Date.now() - exame.inicioQuestao) / 1000));
    const el2 = $('exec-timer');
    if (el2) {
      el2.textContent = `⏱ ${fmtTempo(exame.restante)}`;
      el2.classList.toggle('urgente', exame.restante <= 10);
    }
    if (exame.restante <= 0) {
      pararTimer();
      // tempo esgotado: envia a seleção atual (o servidor decide se expirou) ou pula
      enviarResposta(exame.sel);
    }
  }, 1000);
}

async function enviarResposta(alternativaIdx) {
  if (!exame || exame.enviando) return;
  exame.enviando = true;
  pararTimer();
  const q = exame.questoes[exame.atual];
  $('exec-confirmar') && ($('exec-confirmar').disabled = true);
  const payload = { question_id: q.id };
  if (alternativaIdx !== null) payload.alternativa_idx = alternativaIdx;
  try {
    const { r, d } = await api(`/api/rooms/${exame.roomId}/answer`, { method: 'POST', body: JSON.stringify(payload) });
    if (r.status === 401) { limparExecucao(); mostrarLogin('Sessão expirada. Entre novamente para continuar.'); return; }
    if (r.status === 429) {
      exame.enviando = false;
      mostrarAviso('Muitas respostas em sequência. Aguarde um instante e tente de novo.');
      renderQuestao(); // re-exibe e reinicia o timer
      return;
    }
    if (r.status !== 200 && !(r.status === 409 && d.codigo === 'ALREADY_ANSWERED')) {
      exame.enviando = false;
      mostrarAviso(d.erro || 'Erro ao enviar resposta.');
      renderQuestao();
      return;
    }
    // registrada (ou já estava) → avança
    exame.respondidas.add(q.id);
    exame.atual += 1;
    exame.inicioQuestao = Date.now();
    if (exame.atual >= exame.questoes.length) {
      await finalizarSimulado();
    } else {
      renderQuestao();
    }
  } catch {
    exame.enviando = false;
    mostrarAviso('Falha de rede ao enviar resposta.');
    renderQuestao();
  }
}

async function finalizarSimulado() {
  if (!exame) return;
  const roomId = exame.roomId;
  const nome = exame.roomNome;
  const el = $('exec-card');
  if (el) el.innerHTML = `<div class="state state-loading"><span class="spinner"></span> Corrigindo no servidor…</div>`;
  pararTimer();
  try {
    const { r, d } = await api(`/api/rooms/${roomId}/finish`, { method: 'POST' });
    if (r.ok || d.ja_finalizada) {
      limparExecucao();
      carregarResultado(roomId, nome);
    } else {
      limparExecucao();
      mostrarHome();
      mostrarAviso(d.erro || 'Erro ao finalizar o simulado.');
    }
  } catch {
    limparExecucao();
    mostrarHome();
    mostrarAviso('Falha de rede ao finalizar. Suas respostas foram salvas; tente de novo em "Começar simulado".');
  }
}

// ---------------------------------------------------------------- Resultado (M2)
async function carregarResultado(roomId, roomNome) {
  mostrarView('resultado');
  const msg = $('res-msg');
  const resumoEl = $('res-resumo');
  const questoesEl = $('res-questoes');
  msg.style.display = 'none';
  resumoEl.innerHTML = `<div class="state state-loading"><span class="spinner"></span> Carregando resultado…</div>`;
  questoesEl.innerHTML = '';
  try {
    const { r, d } = await api(`/api/rooms/${roomId}/result`);
    if (!r.ok) {
      mostrarHome();
      mostrarAviso(d.erro || 'Você ainda não finalizou este simulado.');
      return;
    }
    const res = d.resultado;
    const nome = roomNome || (salasCache.find((s) => s.id === roomId) || {}).nome || 'Simulado';
    // total de participantes para "posição X de Y"
    let totalRank = null;
    try {
      const rk = await api(`/api/rooms/${roomId}/ranking`);
      if (rk.r.ok) totalRank = rk.d.total;
    } catch { /* opcional */ }
    window.__resRoomId = roomId;
    resumoEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-end; gap:10px; flex-wrap:wrap">
        <div>
          <h2>Resultado</h2>
          <p style="color:var(--muted); font-size:0.9rem">${escapeHTML(nome)} · ${fmtData(d.attempt?.finalizado_em || d.attempt?.iniciado_em || '')}</p>
        </div>
      </div>
      <div class="grid-metricas" style="margin-top:14px">
        <div class="card metrica"><small>Acertos</small><strong>${res.acertos} <span>/ ${res.total}</span></strong></div>
        <div class="card metrica"><small>Erros</small><strong style="color:var(--erro)">${res.erros}</strong></div>
        <div class="card metrica"><small>Pontuação</small><strong>${res.pontuacao} pts</strong></div>
        <div class="card metrica"><small>Posição</small><strong>${res.posicao}${totalRank !== null ? ' de ' + totalRank : ''}</strong></div>
        <div class="card metrica metrica-destaque"><small>Aproveitamento</small><strong>${res.aproveitamento}%</strong></div>
        <div class="card metrica"><small>Tempo total</small><strong class="num-mono">${fmtTempo(res.tempoTotal)}</strong></div>
      </div>`;
    const porQuestao = d.porQuestao || [];
    if (!porQuestao.length) {
      questoesEl.innerHTML = `<div class="state state-empty">Sem questões para revisar.</div>`;
      return;
    }
    questoesEl.innerHTML = porQuestao.map((pq, idx) => {
      const acertou = !!pq.acertou;
      const semResposta = pq.sua_resposta === null || pq.sua_resposta === undefined;
      const statusBadge = acertou
        ? '<span class="badge badge-ok">✔ Acertou</span>'
        : (semResposta ? '<span class="badge">Não respondida</span>' : '<span class="badge badge-erro">✘ Errou</span>');
      const alts = Array.isArray(pq.alternativas) ? pq.alternativas : [];
      return `
      <div class="card res-questao ${acertou ? 'res-certa' : 'res-errada'}" style="padding:18px">
        <div style="display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-bottom:8px">
          <strong>Questão ${idx + 1}${pq.assunto ? ' • ' + escapeHTML(pq.assunto) : ''}</strong>
          ${statusBadge}
        </div>
        <p style="line-height:1.6; margin-bottom:12px">${escapeHTML(pq.enunciado)}</p>
        <div style="display:flex; flex-direction:column; gap:6px; margin-bottom:10px">
          ${alts.map((alt, i) => {
            const ehCorreta = i === pq.correta_idx;
            const ehEscolha = i === pq.sua_resposta;
            let cls = 'opcao-linha';
            let marca = '';
            if (ehCorreta) { cls += ' linha-certa'; marca = ' ✓'; }
            if (ehEscolha && !ehCorreta) { cls += ' linha-errada'; marca = ' ✗'; }
            return `<div class="${cls}"><span class="opcao-letra">${letras(i)}</span><span style="flex:1">${escapeHTML(alt)}</span><small style="color:var(--muted)">${ehCorreta ? 'correta' : ''}${ehEscolha ? (ehCorreta ? '' : 'sua resposta') : ''}${marca}</small></div>`;
          }).join('')}
        </div>
        ${pq.sua_resposta !== null && pq.sua_resposta !== undefined ? `<p style="font-size:0.9rem; margin-bottom:8px"><small style="color:var(--muted)">Sua resposta: </small><strong class="mono">${letras(pq.sua_resposta)}</strong>${pq.tempo_gasto !== null && pq.tempo_gasto !== undefined ? ` <small class="mono" style="color:var(--muted)">· ${pq.tempo_gasto}s</small>` : ''}</p>` : ''}
        <div class="explicacao"><strong>📖 Explicação</strong><p style="margin-top:4px; line-height:1.6">${escapeHTML(pq.explicacao)}</p></div>
      </div>`;
    }).join('');
  } catch {
    mostrarHome();
    mostrarAviso('Falha de rede ao carregar o resultado.');
  }
}
$('res-voltar')?.addEventListener('click', () => mostrarHome());
$('res-ranking')?.addEventListener('click', () => {
  // usa a sala atual do resultado salvo no título? guardamos o id no clique
  const card = document.querySelector('#resultado .card');
  const roomId = window.__resRoomId;
  if (roomId) abrirRanking(roomId);
});

// ---------------------------------------------------------------- Ranking (M3)
async function abrirRanking(roomId) {
  mostrarView('ranking');
  const sel = $('rank-sala');
  if (!salasCache.length) {
    try { const { r, d } = await api('/api/rooms'); salasCache = r.ok ? (d.rooms || []) : []; } catch { salasCache = []; }
  }
  const opcoes = salasCache.filter((s) => ['ACTIVE', 'PUBLISHED', 'CLOSED'].includes(s.status));
  sel.innerHTML = opcoes.map((s) => `<option value="${escapeHTML(s.id)}">${escapeHTML(s.nome)} (${s.status})</option>`).join('')
    || `<option value="">Nenhuma sala pública</option>`;
  if (roomId && opcoes.some((s) => s.id === roomId)) sel.value = roomId;
  await carregarRanking(sel.value);
}
$('rank-sala')?.addEventListener('change', (e) => carregarRanking(e.target.value));
$('rank-voltar')?.addEventListener('click', () => mostrarHome());
async function carregarRanking(roomId) {
  const grid = $('rank-grid');
  const msg = $('rank-msg');
  if (!roomId) { grid.innerHTML = ''; msg.style.display = 'block'; msg.textContent = 'Sem salas para exibir ranking.'; return; }
  msg.style.display = 'none';
  grid.innerHTML = `<div class="state state-loading"><span class="spinner"></span> Carregando ranking…</div>`;
  try {
    const { r, d } = await api(`/api/rooms/${roomId}/ranking`);
    if (!r.ok) { grid.innerHTML = ''; msg.style.display = 'block'; msg.textContent = d.erro || 'Erro.'; return; }
    const sala = salasCache.find((s) => s.id === roomId);
    const ranking = d.ranking || [];
    if (!ranking.length) {
      grid.innerHTML = '';
      msg.style.display = 'block';
      msg.textContent = `Nenhum resultado ainda na sala "${sala ? sala.nome : ''}". Seja o primeiro a finalizar.`;
      return;
    }
    const euId = usuario && usuario.id;
    $('rank-title').textContent = `Desempenho da turma · ${sala ? sala.nome : ''}`.trim().replace(/·\s*$/, '');
    grid.innerHTML = `
      <div class="placar">
        <div class="placar-cab" aria-hidden="true">
          <span class="placar-pos">#</span>
          <span class="placar-nome">Aluno</span>
          <span class="placar-col-acertos">Acertos</span>
          <span class="placar-col-pontos">Pontos</span>
          <span class="placar-col-tempo">Tempo</span>
        </div>
        ${ranking.map((u, i) => `
        <div class="placar-linha ${i < 3 ? 'top3' : ''} ${euId && u.user_id === euId ? 'eu' : ''}">
          <span class="placar-pos">${i + 1}º</span>
          <span class="placar-nome">${escapeHTML(u.nick)}</span>
          <span class="placar-col-acertos placar-num">${u.acertos}</span>
          <span class="placar-col-pontos placar-num">${u.pontuacao}</span>
          <span class="placar-col-tempo placar-num">${fmtTempo(u.tempo_total)}</span>
        </div>`).join('')}
      </div>`;
  } catch {
    grid.innerHTML = '';
    msg.style.display = 'block';
    msg.textContent = 'Falha de rede ao carregar o ranking.';
  }
}

// ---------------------------------------------------------------- Meu histórico (M4)
async function abrirHistorico() {
  if (!usuario) { exigirLogin(() => abrirHistorico()); return; }
  mostrarView('historico');
  const statsEl = $('hist-stats');
  const listaEl = $('hist-lista');
  const msg = $('hist-msg');
  msg.style.display = 'none';
  statsEl.innerHTML = `<div class="state state-loading"><span class="spinner"></span> Carregando…</div>`;
  listaEl.innerHTML = '';
  try {
    const [sRes, hRes] = await Promise.all([api('/api/me/stats'), api('/api/me/history')]);
    const st = sRes.d || {};
    const hist = (hRes.d && hRes.d.history) || [];
    const totalSubs = Object.keys(st.porAssunto || {}).length;
    // frase de orientação: assunto com menor taxa de acerto
    const piores = Object.entries(st.porAssunto || {}).filter(([, v]) => (v.total || 0) > 0).sort((a, b) => a[1].taxa - b[1].taxa);
    const fraseOrient = piores.length
      ? `<p class="pp-frase" style="margin-top:14px">Seu ponto mais fraco agora é <strong>${escapeHTML(piores[0][0])}</strong> (${piores[0][1].taxa}% de acerto) — considere revisá-lo antes da próxima prova.</p>`
      : '';
    statsEl.innerHTML = `
      <div class="grid-metricas">
        <div class="card metrica"><small>Simulados</small><strong>${st.totalSimulados || 0}</strong></div>
        <div class="card metrica"><small>Taxa de acerto</small><strong>${st.taxaAcerto || 0}%</strong></div>
        <div class="card metrica"><small>Questões respondidas</small><strong>${st.questoesRespondidas || 0}</strong></div>
        <div class="card metrica"><small>Pontuação total</small><strong>${st.pontuacaoTotal || 0}</strong></div>
        <div class="card metrica"><small>Melhor posição</small><strong>${st.melhorPosicao ? st.melhorPosicao + 'º' : '—'}</strong></div>
        <div class="card metrica"><small>Assuntos</small><strong>${totalSubs}</strong></div>
      </div>
      ${fraseOrient}
      ${Object.keys(st.porAssunto || {}).length ? `
      <div class="card" style="margin-top:14px">
        <h4 style="margin-bottom:10px; font-size:0.95rem">Desempenho por assunto</h4>
        ${Object.entries(st.porAssunto).map(([a, v]) => `
          <div style="margin-bottom:8px">
            <div style="display:flex; justify-content:space-between; font-size:0.85rem"><span>${escapeHTML(a)}</span><span style="color:var(--muted)">${v.acertos}/${v.total} (${v.taxa}%)</span></div>
            <div class="barra"><div class="barra-preenchida" style="width:${Math.max(0, Math.min(100, v.taxa))}%"></div></div>
          </div>`).join('')}
      </div>` : ''}
      <div class="card" style="margin-top:14px">
        <h4 style="margin-bottom:10px; font-size:0.95rem">Desempenho por matéria</h4>
        ${Object.keys(st.porMateria || {}).length ? Object.entries(st.porMateria).map(([m, v]) =>
          `<div style="display:flex; justify-content:space-between; font-size:0.85rem; margin-bottom:6px"><span>${escapeHTML(m)}</span><span style="color:var(--muted)">${v.acertos}/${v.total} (${v.taxa}%)</span></div>`).join('')
          : '<small style="color:var(--muted)">Sem dados por matéria ainda.</small>'}
      </div>`;
    if (!hist.length) {
      listaEl.innerHTML = '';
      msg.style.display = 'block';
      msg.textContent = 'Você ainda não finalizou nenhum simulado. Escolha uma sala acima e comece o primeiro.';
      return;
    }
    listaEl.innerHTML = hist.map((h) => `
      <div class="card linha-rank" style="flex-wrap:wrap">
        <div style="flex:1; min-width:200px">
          <strong>${escapeHTML(h.room_nome)}</strong><br>
          <small style="color:var(--muted)">${fmtData(h.finalizado_em)}</small>
        </div>
        <span class="badge">${h.acertos}/${h.total} <span style="opacity:0.7">· ${h.porcentagem}%</span></span>
        <small class="mono" style="color:var(--muted)">${h.pontuacao} pts</small>
        <small class="mono" style="color:var(--muted)">${h.posicao}º de ${h.total_participantes}</small>
        <button class="btn btn-ghost" style="padding:6px 12px; font-size:0.85rem" data-acao="ver-resultado" data-room="${escapeHTML(h.room_id)}">Ver resultado</button>
      </div>`).join('');
  } catch {
    statsEl.innerHTML = '';
    listaEl.innerHTML = '';
    msg.style.display = 'block';
    msg.textContent = 'Falha de rede ao carregar o histórico.';
  }
}
$('hist-lista')?.addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-acao="ver-resultado"]');
  if (!btn) return;
  window.__resRoomId = btn.dataset.room;
  carregarResultado(btn.dataset.room, '');
});

// ---------------------------------------------------------------- Admin — criar sala
function popularMaterias() {
  const sel = $('admin-materia');
  if (!sel || sel.options.length > 1) return;
  const mats = [
    { id: 'geral', nome: 'Conhecimentos Gerais' },
    { id: 'matematica', nome: 'Matemática' },
    { id: 'portugues', nome: 'Português' },
    { id: 'historia', nome: 'História' },
    { id: 'geografia', nome: 'Geografia' },
    { id: 'ciencias', nome: 'Ciências' },
  ];
  mats.forEach((m) => {
    const o = document.createElement('option');
    o.value = m.id; o.textContent = m.nome;
    sel.appendChild(o);
  });
}

$('admin-create-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = $('admin-create-msg');
  if (msg) msg.textContent = 'Criando...';
  const qtd = Number($('admin-qtd').value);
  if (!Number.isInteger(qtd) || qtd < 5 || qtd > 50) {
    if (msg) msg.textContent = 'Quantidade deve ser um inteiro entre 5 e 50.';
    return;
  }
  const payload = {
    nome: $('admin-nome').value.trim(),
    descricao: $('admin-desc').value.trim(),
    materia_id: $('admin-materia').value || null,
    assuntos: $('admin-assuntos').value.split(',').map((s) => s.trim()).filter(Boolean),
    quantidade: qtd,
    dificuldade: $('admin-dif').value,
    tempo_por_questao: Number($('admin-tempo').value)
  };
  try {
    const { r, d } = await api('/api/rooms', { method: 'POST', body: JSON.stringify(payload) });
    if (!r.ok) { if (msg) msg.textContent = d.erro || 'Erro'; return; }
    if (msg) msg.textContent = `Criado: ${d.room.nome} (${d.room.status})`;
    e.target.reset();
    $('admin-qtd').value = '10';
    carregarSalas(); carregarAdmin();
  } catch { if (msg) msg.textContent = 'Falha de rede'; }
});

// ---------------------------------------------------------------- Admin — salas
async function carregarAdmin() {
  const grid = $('admin-grid');
  const emptyEl = $('admin-empty');
  if (!grid) return;
  grid.innerHTML = `<div class="state state-loading"><span class="spinner"></span> Carregando salas...</div>`;
  try {
    const { r, d } = await api('/api/rooms');
    const rooms = (d.rooms || []);
    if (!rooms.length) { grid.innerHTML = ''; if (emptyEl) emptyEl.style.display = 'block'; return; }
    if (emptyEl) emptyEl.style.display = 'none';
    grid.innerHTML = rooms.map((s) => {
      const assuntos = parseAssuntos(s.assuntos).map((a) => escapeHTML(a)).join(', ');
      const podeEditarConteudo = s.status === 'DRAFT' || s.status === 'REVIEW';
      return `<div class="card admin-grid-item">
        <div style="display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap">
          <strong>${escapeHTML(s.nome)}</strong>
          <span class="badge">${s.status}</span>
        </div>
        <small>${escapeHTML(s.descricao) || ''} · ${escapeHTML(s.materia_id || 'geral')} · ${escapeHTML(assuntos)} · ${s.quantidade}Q · ${s.tempo_por_questao === 0 ? 'sem limite' : s.tempo_por_questao + 's'}</small>
        ${s.codigo ? `<small><code>#${escapeHTML(s.codigo)}</code></small>` : ''}
        <div class="acoes">
          <button class="btn btn-ghost" data-admin-action="gerarIA" data-id="${s.id}">Gerar IA</button>
          <button class="btn btn-ghost" data-admin-action="revisarQuestoes" data-id="${s.id}">Revisar questões</button>
          ${podeEditarConteudo ? `<button class="btn btn-ghost" data-admin-action="mudarStatus" data-id="${s.id}" data-arg="REVIEW">Review</button>
          <button class="btn btn-ghost" data-admin-action="mudarStatus" data-id="${s.id}" data-arg="PUBLISHED">Publicar</button>` : ''}
          <button class="btn btn-primary" data-admin-action="mudarStatus" data-id="${s.id}" data-arg="ACTIVE">Ativar</button>
          <button class="btn btn-ghost" data-admin-action="mudarStatus" data-id="${s.id}" data-arg="CLOSED">Fechar</button>
          <button class="btn btn-ghost" data-admin-action="mudarStatus" data-id="${s.id}" data-arg="ARCHIVED">Arquivar</button>
          <button class="btn btn-ghost" style="color:var(--erro)" data-admin-action="deletarSala" data-id="${s.id}">Excluir</button>
        </div>
        <div id="admin-msg-${s.id}" style="font-size:0.8rem; color:var(--muted)" aria-live="polite"></div>
      </div>`;
    }).join('');
  } catch { grid.innerHTML = `<div class="state state-error">Erro ao carregar salas admin.</div>`; }
}
$('admin-refresh')?.addEventListener('click', () => { carregarAdmin(); if (revisao) carregarRevisao(revisao.roomId); });

window.gerarIA = async (id, force = false) => {
  const el = document.getElementById(`admin-msg-${id}`);
  if (el) el.textContent = 'Gerando com IA...';
  try {
    const url = force ? `/api/rooms/${id}/generate?force=1` : `/api/rooms/${id}/generate`;
    const { r, d } = await api(url, { method: 'POST' });
    if (!r.ok) {
      if (el) el.textContent = `${d.erro || 'Erro'}${d.aviso ? ' — ' + d.aviso : ''}`;
      return;
    }
    if (el) el.textContent = `Gerado: ${d.quantidade || (d.questoes || []).length} questões via ${d.provedor}`;
    if (d.aviso) {
      const av = document.createElement('div');
      av.style.cssText = 'color:var(--warning);font-size:0.8rem;margin-top:4px';
      av.textContent = d.aviso;
      el && el.appendChild(av);
    }
    await carregarAdmin();
    const feedback = document.getElementById(`admin-msg-${id}`);
    if (feedback) feedback.textContent = d.aviso || `Geradas ${d.quantidade || d.questoes?.length || 0} questões via ${d.provedor}.`;
    if (revisao && revisao.roomId === id) await carregarRevisao(id, true);
  } catch { if (el) el.textContent = 'Falha'; }
};
window.mudarStatus = async (id, st) => {
  const el = document.getElementById(`admin-msg-${id}`);
  if (el) el.textContent = `Alterando para ${st}...`;
  try {
    const { r, d } = await api(`/api/rooms/${id}/status`, { method: 'POST', body: JSON.stringify({ status: st }) });
    if (!r.ok) { if (el) el.textContent = d.erro || 'Erro'; return; }
    if (el) el.textContent = `Status: ${d.room.status}${d.room.codigo ? ' · Código: ' + d.room.codigo : ''}`;
    if (st === 'PUBLISHED' || st === 'ACTIVE') fecharRevisao(false);
    carregarSalas(); carregarAdmin();
  } catch { if (el) el.textContent = 'Falha'; }
};
window.deletarSala = async (id) => {
  if (!confirm('Excluir esta sala?')) return;
  const { r, d } = await api(`/api/rooms/${id}`, { method: 'DELETE' });
  if (!r.ok) { alert(d.erro || 'Erro'); return; }
  carregarSalas(); carregarAdmin();
};

// ---------------------------------------------------------------- Admin — revisão de questões (M5)
window.revisarQuestoes = async (id) => {
  if (!adminLogado) return;
  revisao = { roomId: id };
  $('admin-review').style.display = 'block';
  $('review-titulo').textContent = `Revisar questões`;
  await carregarRevisao(id, false);
};
async function carregarRevisao(id, forcarRecarga) {
  const container = $('review-questoes');
  const msg = $('review-msg');
  const aviso = $('review-aviso');
  const sala = (salasCache.find((s) => s.id === id)) || {};
  if (sala.status && !['DRAFT', 'REVIEW'].includes(sala.status)) {
    aviso.style.display = 'block';
    aviso.textContent = 'Sala fora de DRAFT/REVIEW: você pode conferir as questões, mas a regeneração individual está bloqueada.';
  } else { aviso.style.display = 'none'; }
  msg.textContent = '';
  container.innerHTML = `<div class="state state-loading"><span class="spinner"></span> Carregando questões…</div>`;
  try {
    const { r, d } = await api(`/api/rooms/${id}/questions`);
    if (!r.ok) { container.innerHTML = ''; msg.textContent = d.erro || 'Erro ao carregar.'; return; }
    const questoes = d.questoes || [];
    revisao = { roomId: id, roomNome: sala.nome || id, questoes };
    $('review-titulo').textContent = `Revisar questões — ${sala.nome || ''} (${questoes.length})`;
    if (!questoes.length) {
      container.innerHTML = `<div class="state state-empty">Nenhuma questão gerada ainda. Clique em "Gerar IA" na sala acima.</div>`;
      return;
    }
    const podeRegenerar = !sala.status || ['DRAFT', 'REVIEW'].includes(sala.status);
    container.innerHTML = questoes.map((q, idx) => `
      <div class="card" style="padding:16px; ${idx % 2 ? 'background:var(--surface)' : ''}">
        <div style="display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-bottom:6px">
          <strong>Q${idx + 1}${q.assunto ? ' · ' + escapeHTML(q.assunto) : ''} ${q.dificuldade ? '<span class="badge">' + escapeHTML(q.dificuldade) + '</span>' : ''}</strong>
          ${podeRegenerar ? `<button class="btn btn-ghost" style="padding:4px 10px; font-size:0.78rem" data-admin-action="regenerarQuestao" data-id="${id}" data-arg="${q.id}">Regenerar</button>` : ''}
        </div>
        <p style="line-height:1.5; margin-bottom:8px">${escapeHTML(q.enunciado)}</p>
        <div style="display:flex; flex-direction:column; gap:4px; margin-bottom:8px">
          ${q.alternativas.map((a, i) => {
            const certa = i === q.correta_idx;
            return `<div class="opcao-linha ${certa ? 'linha-certa' : ''}"><span class="opcao-letra">${letras(i)}</span><span style="flex:1">${escapeHTML(a)}</span>${certa ? '<strong style="color:var(--success); font-size:0.8rem">GABARITO ✓</strong>' : ''}</div>`;
          }).join('')}
        </div>
        ${q.explicacao ? `<div class="explicacao" style="font-size:0.9rem"><strong>📖 Explicação</strong><p style="margin-top:2px">${escapeHTML(q.explicacao)}</p></div>` : ''}
      </div>`).join('');
  } catch {
    container.innerHTML = '';
    msg.textContent = 'Falha de rede ao carregar as questões.';
  }
}
window.regenerarQuestao = async (roomId, questionId) => {
  const msg = $('review-msg');
  msg.textContent = 'Regenerando questão…';
  try {
    const { r, d } = await api(`/api/rooms/${roomId}/questions/${questionId}/regenerate`, { method: 'POST' });
    if (!r.ok) { msg.textContent = d.erro || 'Erro ao regenerar.'; return; }
    msg.textContent = d.aviso || 'Questão regenerada.';
    await carregarRevisao(roomId, false);
  } catch { msg.textContent = 'Falha de rede.'; }
}
$('review-fechar')?.addEventListener('click', () => fecharRevisao(true));
$('review-force')?.addEventListener('click', () => {
  if (revisao && confirm('Regenerar TODAS as questões com a IA? As atuais serão substituídas.')) {
    gerarIA(revisao.roomId, true);
  }
});
function fecharRevisao(recarregarAdmin) {
  if (revisao) revisao = null;
  const rv = $('admin-review');
  if (rv) rv.style.display = 'none';
  if (recarregarAdmin) carregarAdmin();
}

// ---------------------------------------------------------------- Navegação
$('nav-salas')?.addEventListener('click', (e) => { e.preventDefault(); limparExecucao(); mostrarHome(); carregarSalas(); });
$('nav-ranking')?.addEventListener('click', (e) => { e.preventDefault(); abrirRanking(); });
$('nav-historico')?.addEventListener('click', (e) => { e.preventDefault(); abrirHistorico(); });
$('nav-admin')?.addEventListener('click', (e) => {
  e.preventDefault();
  limparExecucao();
  mostrarHome('admin');
  carregarAdmin();
});
$('rodape-salas')?.addEventListener('click', (e) => { e.preventDefault(); limparExecucao(); mostrarHome(); carregarSalas(); });
$('rodape-ranking')?.addEventListener('click', (e) => { e.preventDefault(); abrirRanking(); });

// ---------------------------------------------------------------- Menu mobile (hambúrguer)
const btnMenu = $('btn-menu');
const navLinks = $('nav-links');
function menuAberto(aberto) {
  if (!navLinks) return;
  navLinks.classList.toggle('aberto', !!aberto);
  if (btnMenu) {
    btnMenu.setAttribute('aria-expanded', String(!!aberto));
    btnMenu.setAttribute('aria-label', aberto ? 'Fechar menu de navegação' : 'Abrir menu de navegação');
  }
}
btnMenu?.addEventListener('click', () => menuAberto(!navLinks?.classList.contains('aberto')));
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && navLinks?.classList.contains('aberto')) { menuAberto(false); btnMenu?.focus(); } });
// qualquer clique dentro do menu (link, tema, perfil, sair) fecha o painel
navLinks?.addEventListener('click', () => menuAberto(false));
document.addEventListener('click', (ev) => {
  if (navLinks?.classList.contains('aberto') && !ev.target.closest('#btn-menu') && !ev.target.closest('#nav-links')) menuAberto(false);
});

// ---------------------------------------------------------------- Splash (3s) + gate de login
const SPLASH_MS = 3000;
function esconderSplash() {
  const s = $('splash');
  if (!s) return;
  s.classList.add('saindo');
  setTimeout(() => { s.style.display = 'none'; }, 380);
}
function mostrarLogin(aviso) {
  setModo('login');
  const sp = $('splash');
  if (sp) { sp.classList.remove('saindo'); sp.style.display = 'none'; }
  $('site')?.classList.remove('visivel');
  $('login-screen')?.classList.add('visivel');
  carregarLoginStats();
  msgEl.textContent = aviso || '';
  msgEl.style.color = 'var(--erro)';
  setTimeout(() => {
    const alvo = modo === 'login' ? emailEl : nickEl;
    if (alvo && alvo.style.display !== 'none') alvo.focus({ preventScroll: true });
  }, 80);
}
function entrarNoSite() {
  $('login-screen')?.classList.remove('visivel');
  $('site')?.classList.add('visivel');
  carregarSalas();
  carregarRodape();
  window.scrollTo(0, 0);
}
function carregarRodape() {
  fetch('/api/health').then((r) => r.json()).then((d) => {
    const el = $('footer-stats');
    if (el) el.textContent = `db: ${d.db} | ${d.env} | ${new Date(d.time).toLocaleDateString('pt-BR')}`;
  }).catch(() => {});
}
function abrirResetSeToken() {
  const params = new URLSearchParams(location.search);
  const token = params.get('resetar') || '';
  if (token) abrirReset(token);
}
async function sair() {
  try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch { /* segue */ }
  usuario = null; adminLogado = false;
  limparExecucao();
  document.body.classList.remove('em-prova');
  menuAberto(false);
  carregarAdminLimpar();
  $('nav-historico').style.display = 'none';
  $('nav-admin').style.display = 'none';
  const area = $('auth-area');
  if (area) area.innerHTML = '';
  mostrarLogin();
}

// ---------------------------------------------------------------- Boot
async function boot() {
  const tIni = Date.now();
  renderizarConteudoEntrada();
  initTema();
  // dispara em paralelo: (a) splash de 3s e (b) checagem de sessão — só troca de tela quando os dois terminarem
  requestAnimationFrame(() => $('splash')?.classList.add('rodando'));
  await Promise.all([refreshAuth(), delay(SPLASH_MS)]);
  esconderSplash();
  try { sessionStorage.setItem('nivora-splash-ms', String(Date.now() - tIni)); } catch { /* ignora */ }
  if (usuario) { entrarNoSite(); } else { mostrarLogin(); }
  abrirResetSeToken();
}
boot();

// External listeners remain compatible with script-src 'self'.
document.querySelectorAll('[data-close-dialog]').forEach((button) => {
  button.addEventListener('click', () => document.getElementById(button.dataset.closeDialog)?.close());
});

const adminActions = { gerarIA: window.gerarIA, revisarQuestoes: window.revisarQuestoes, mudarStatus: window.mudarStatus, deletarSala: window.deletarSala, regenerarQuestao: window.regenerarQuestao };
document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-admin-action]');
  if (!button || button.disabled) return;
  const action = adminActions[button.dataset.adminAction];
  if (!action) return;
  button.disabled = true;
  try { await action(button.dataset.id, button.dataset.arg); }
  catch { mostrarAviso('Não foi possível concluir a ação. Tente novamente.'); }
  finally { button.disabled = false; }
});
