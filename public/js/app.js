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
fetch('/api/health').then(r=>r.json()).then(d=>console.log('health', d)).catch(()=>{});
