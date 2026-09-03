// NIVORA — frontend Fase 2 (auth)
let modo = 'login'; // login | register

const authArea = document.getElementById('auth-area');
const dialog = document.getElementById('auth-dialog');
const form = document.getElementById('auth-form');
const nickEl = document.getElementById('auth-nick');
const emailEl = document.getElementById('auth-email');
const senhaEl = document.getElementById('auth-senha');
const msgEl = document.getElementById('auth-msg');
const titleEl = document.getElementById('auth-title');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const btnComecar = document.getElementById('btn-comecar');

function setModo(m) {
  modo = m;
  const isLogin = m === 'login';
  titleEl.textContent = isLogin ? 'Entrar na Nivora' : 'Criar conta na Nivora';
  nickEl.style.display = isLogin ? 'none' : 'block';
  nickEl.required = !isLogin;
  document.getElementById('auth-submit').textContent = isLogin ? 'Entrar' : 'Criar conta';
  tabLogin.style.background = isLogin ? 'var(--gradient)' : 'var(--card-2)';
  tabLogin.style.color = isLogin ? '#fff' : 'var(--text)';
  tabRegister.style.background = !isLogin ? 'var(--gradient)' : 'var(--card-2)';
  tabRegister.style.color = !isLogin ? '#fff' : 'var(--text)';
  msgEl.textContent = '';
}

tabLogin?.addEventListener('click', () => setModo('login'));
tabRegister?.addEventListener('click', () => setModo('register'));
btnComecar?.addEventListener('click', () => { setModo('login'); dialog.showModal(); });

async function refreshAuth() {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (r.ok) {
      const d = await r.json();
      authArea.innerHTML = `<span style="color:var(--muted)">Olá, <strong>${d.usuario.nick}</strong> • ${d.usuario.papel}</span> <button id="btn-logout" class="btn" style="padding:6px 12px; background:var(--card-2); border:1px solid var(--border)">Sair</button>`;
      document.getElementById('btn-logout')?.addEventListener('click', async () => {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
        refreshAuth();
      });
    } else {
      authArea.innerHTML = `<button id="btn-entrar" class="btn btn-primary" style="padding:8px 14px">Entrar</button>`;
      document.getElementById('btn-entrar')?.addEventListener('click', () => { setModo('login'); dialog.showModal(); });
    }
  } catch {
    authArea.innerHTML = '';
  }
}

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  msgEl.textContent = '';
  const payload = modo === 'login'
    ? { email: emailEl.value.trim(), senha: senhaEl.value }
    : { nick: nickEl.value.trim(), email: emailEl.value.trim(), senha: senhaEl.value };
  const url = modo === 'login' ? '/api/auth/login' : '/api/auth/register';
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(payload) });
    const d = await r.json();
    if (!r.ok) { msgEl.textContent = d.erro || 'Erro'; return; }
    dialog.close();
    form.reset();
    refreshAuth();
  } catch {
    msgEl.textContent = 'Falha de rede';
  }
});

setModo('login');
refreshAuth();

// Footer stats + health
fetch('/api/health').then(r=>r.json()).then(d=>{
  console.log('health', d);
  const el = document.getElementById('footer-stats');
  if (el) el.textContent = `API ${d.db} • ${d.env} • ${new Date(d.time).toLocaleDateString('pt-BR')}`;
}).catch(()=>{});

// Fase 4/10 — listar salas com estados loading/error/empty (Fase 10)
async function carregarSalas() {
  const grid = document.getElementById('salas-grid');
  const statusEl = document.getElementById('salas-status');
  const errorEl = document.getElementById('salas-error');
  const emptyEl = document.getElementById('salas-empty');
  if (!grid) return;
  // loading
  if (statusEl) statusEl.textContent = 'Carregando...';
  if (errorEl) errorEl.style.display = 'none';
  if (emptyEl) emptyEl.style.display = 'none';
  grid.innerHTML = `<div class="card skeleton" style="height:120px"></div><div class="card skeleton" style="height:120px"></div><div class="card skeleton" style="height:120px"></div>`;
  try {
    const r = await fetch('/api/rooms', { credentials: 'same-origin' });
    if (!r.ok) throw new Error('Falha ao carregar salas');
    const d = await r.json();
    const rooms = d.rooms || [];
    if (statusEl) statusEl.textContent = `${rooms.length} sala(s)`;
    if (!rooms.length) {
      grid.innerHTML = '';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }
    grid.innerHTML = rooms.map((s) => {
      const assuntos = (()=>{ try{return JSON.parse(s.assuntos||'[]').join(', ')}catch{return s.assuntos||''}})();
      return `
      <div class="card" style="display:flex; flex-direction:column; gap:8px">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span class="badge">${s.status} • ${s.dificuldade}</span>
          ${s.codigo ? `<small style="color:var(--muted)" aria-label="Código da sala">#${s.codigo}</small>` : ''}
        </div>
        <strong style="font-family:var(--font-title)">${s.nome}</strong>
        <small style="color:var(--muted); line-height:1.4">${s.descricao || 'Sem descrição'}</small>
        <small style="color:var(--muted)">${s.quantidade} questões • ${s.tempo_por_questao}s/questão • ${assuntos}</small>
        <button class="btn btn-primary" style="width:100%; margin-top:auto" onclick="alert('Fase 6: Entrar em ${s.nome.replace(/'/g, "\\'")} — faça login e inicie a tentativa')" aria-label="Entrar na sala ${s.nome}">Entrar</button>
      </div>`;
    }).join('');
  } catch (e) {
    grid.innerHTML = '';
    if (statusEl) statusEl.textContent = 'Erro';
    if (errorEl) { errorEl.textContent = 'Erro ao carregar salas. Verifique sua conexão e tente novamente.'; errorEl.style.display = 'block'; }
  }
}
carregarSalas();
