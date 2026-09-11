// NIVORA — frontend
function escapeHTML(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
let modo = 'login'; // login | register
let usuarioAtual = null;
let salasDisponiveis = [];
const materias = { geral: 'Conhecimentos gerais', matematica: 'Matemática', portugues: 'Português', historia: 'História', geografia: 'Geografia', ciencias: 'Ciências' };

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
  tabLogin.setAttribute('aria-selected', String(isLogin));
  tabRegister.setAttribute('aria-selected', String(!isLogin));
  senhaEl.autocomplete = isLogin ? 'current-password' : 'new-password';
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
btnComecar?.addEventListener('click', () => { if (usuarioAtual) { document.getElementById('salas').scrollIntoView(); return; } setModo('login'); dialog.showModal(); });

async function refreshAuth() {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (r.ok) {
      const d = await r.json();
      usuarioAtual = d.usuario;
      btnComecar.textContent = 'Continuar estudando';
      const isAdmin = d.usuario.papel === 'ADMIN';
      authArea.innerHTML = `<span style="color:var(--muted)">Olá, <strong>${escapeHTML(d.usuario.nick)}</strong> • ${d.usuario.papel}</span> <button id="btn-logout" class="btn" style="padding:6px 12px; background:var(--card-2); border:1px solid var(--border)">Sair</button>`;
      document.getElementById('btn-logout')?.addEventListener('click', async () => {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
        refreshAuth();
        carregarSalas();
      });
      // Admin UI
      const navAdmin = document.getElementById('nav-admin');
      const adminSec = document.getElementById('admin');
      if (isAdmin) {
        if (navAdmin) navAdmin.style.display = '';
        if (adminSec) adminSec.style.display = '';
        carregarAdmin();
        popularMaterias();
      } else {
        if (navAdmin) navAdmin.style.display = 'none';
        if (adminSec) adminSec.style.display = 'none';
      }
    } else {
      usuarioAtual = null;
      btnComecar.textContent = 'Entrar na minha conta';
      authArea.innerHTML = `<button id="btn-entrar" class="btn btn-primary" style="padding:8px 14px">Entrar</button>`;
      document.getElementById('btn-entrar')?.addEventListener('click', () => { setModo('login'); dialog.showModal(); });
      const navAdmin = document.getElementById('nav-admin');
      const adminSec = document.getElementById('admin');
      if (navAdmin) navAdmin.style.display = 'none';
      if (adminSec) adminSec.style.display = 'none';
    }
  } catch {
    authArea.innerHTML = '';
  }
}

function popularMaterias() {
  const sel = document.getElementById('admin-materia');
  if (!sel || sel.options.length > 1) return;
  const mats = [
    {id:'geral', nome:'Conhecimentos Gerais'},
    {id:'matematica', nome:'Matemática'},
    {id:'portugues', nome:'Português'},
    {id:'historia', nome:'História'},
    {id:'geografia', nome:'Geografia'},
    {id:'ciencias', nome:'Ciências'},
  ];
  mats.forEach(m=>{
    const o = document.createElement('option');
    o.value = m.id; o.textContent = m.nome;
    sel.appendChild(o);
  });
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

function renderSalas() {
  const busca = document.getElementById('room-search').value.trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const materia = document.getElementById('room-subject').value;
  const rooms = salasDisponiveis.filter(s => {
    const texto = `${s.nome} ${s.descricao || ''} ${s.assuntos || ''} ${materias[s.materia_id] || s.materia_id || ''}`.toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return (!materia || s.materia_id === materia) && texto.includes(busca);
  });
  document.getElementById('salas-status').textContent = `${rooms.length} ${rooms.length === 1 ? 'sala disponível' : 'salas disponíveis'}`;
  const empty = document.getElementById('salas-empty');
  empty.style.display = rooms.length ? 'none' : 'block';
  empty.innerHTML = salasDisponiveis.length ? '<strong>Nenhuma sala com esses filtros.</strong><p>Tente outro assunto ou selecione todas as matérias.</p>' : '<strong>Seu próximo desafio está a caminho.</strong><p>Ainda não há salas disponíveis. Volte em breve para explorar novos simulados.</p>';
  document.getElementById('salas-grid').innerHTML = rooms.map(s => `<article class="card room-card">
    <div class="room-top"><span class="room-symbol" aria-hidden="true">${s.materia_id === 'matematica' ? '∑' : '↗'}</span><span class="badge">${s.status === 'ACTIVE' ? 'Aberta para estudar' : 'Publicada'}</span></div>
    <span class="eyebrow">${escapeHTML(materias[s.materia_id] || s.materia_id || 'Conhecimentos gerais')}</span>
    <h3>${escapeHTML(s.nome)}</h3><p>${escapeHTML(s.descricao || 'Um novo espaço para colocar seus conhecimentos em prática.')}</p>
    <div class="room-meta"><span>${escapeHTML(s.quantidade)} questões</span><span>·</span><span>${escapeHTML(({facil:'Fácil',medio:'Médio',dificil:'Difícil',muito_dificil:'Muito difícil',personalizado:'Personalizado'})[s.dificuldade] || s.dificuldade)}</span><span>·</span><span>${Number(s.tempo_por_questao) ? `${escapeHTML(s.tempo_por_questao)}s por questão` : 'Sem limite de tempo'}</span></div>
    <button class="btn btn-ghost" data-room="${escapeHTML(s.id)}">Conhecer simulado <span aria-hidden="true">↗</span></button></article>`).join('');
}
document.getElementById('room-search').addEventListener('input', renderSalas);
document.getElementById('room-subject').addEventListener('change', renderSalas);
document.getElementById('rooms-retry').addEventListener('click', carregarSalas);
document.getElementById('salas-grid').addEventListener('click', e => {
  const button = e.target.closest('[data-room]');
  if (!button) return;
  const room = salasDisponiveis.find(s => s.id === button.dataset.room);
  if (!room) return;
  let details = document.getElementById('room-details');
  if (!details) { details = document.createElement('dialog'); details.id = 'room-details'; details.setAttribute('aria-labelledby', 'room-details-title'); document.body.append(details); }
  details.innerHTML = `<span class="eyebrow">${escapeHTML(materias[room.materia_id] || 'SIMULADO')}</span><h2 id="room-details-title">${escapeHTML(room.nome)}</h2><p>${escapeHTML(room.descricao || 'Pratique seus conhecimentos neste simulado.')}</p><p>${escapeHTML(room.quantidade)} questões · ${Number(room.tempo_por_questao) ? `${escapeHTML(room.tempo_por_questao)} segundos por questão` : 'Sem limite de tempo'}</p><div class="state">${room.status === 'ACTIVE' ? 'A participação pelo site ainda está em preparação nesta versão. Você já pode explorar as salas disponíveis.' : 'Este simulado ainda aguarda abertura para participação.'}</div><button class="btn btn-primary" id="close-room" style="margin-top:20px">Voltar às salas</button>`;
  details.querySelector('#close-room').addEventListener('click', () => details.close());
  details.showModal();
});

// Fase 4/10 — listar salas com estados loading/error/empty (Fase 10)
async function carregarSalas() {
  const grid = document.getElementById('salas-grid');
  const statusEl = document.getElementById('salas-status');
  const errorEl = document.getElementById('salas-error');
  const emptyEl = document.getElementById('salas-empty');
  if (!grid) return;
  const controls = ['room-search', 'room-subject', 'rooms-retry'].map(id => document.getElementById(id));
  controls.forEach(el => { el.disabled = true; });
  // loading
  if (statusEl) statusEl.textContent = 'Carregando...';
  if (errorEl) errorEl.style.display = 'none';
  if (emptyEl) emptyEl.style.display = 'none';
  grid.innerHTML = `<div class="card skeleton" style="height:120px"></div><div class="card skeleton" style="height:120px"></div><div class="card skeleton" style="height:120px"></div>`;
  try {
    const r = await fetch('/api/rooms', { credentials: 'same-origin' });
    if (!r.ok) throw new Error('Falha ao carregar salas');
    const d = await r.json();
    const rooms = (d.rooms || []).filter(s => ['ACTIVE', 'PUBLISHED'].includes(s.status));
    salasDisponiveis = rooms;
    const subject = document.getElementById('room-subject');
    const selectedSubject = subject.value;
    subject.replaceChildren(new Option('Todas as matérias', ''));
    [...new Set(rooms.map(s => s.materia_id).filter(Boolean))].sort().forEach(id => subject.add(new Option(materias[id] || id, id)));
    subject.value = [...subject.options].some(o => o.value === selectedSubject) ? selectedSubject : '';
    renderSalas();
    controls.forEach(el => { el.disabled = false; });
  } catch (e) {
    document.getElementById('rooms-retry').disabled = false;
    grid.innerHTML = '';
    if (statusEl) statusEl.textContent = 'Erro';
    if (errorEl) { errorEl.textContent = 'Erro ao carregar salas. Verifique sua conexão e tente novamente.'; errorEl.style.display = 'block'; }
  }
}
carregarSalas();

// Admin — criar sala
document.getElementById('admin-create-form')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const msg = document.getElementById('admin-create-msg');
  if (msg) msg.textContent = 'Criando...';
  const payload = {
    nome: (document.getElementById('admin-nome')).value.trim(),
    descricao: (document.getElementById('admin-desc')).value.trim(),
    materia_id: (document.getElementById('admin-materia')).value || null,
    assuntos: (document.getElementById('admin-assuntos')).value.split(',').map(s=>s.trim()).filter(Boolean),
    quantidade: Number((document.getElementById('admin-qtd')).value),
    dificuldade: (document.getElementById('admin-dif')).value,
    tempo_por_questao: Number((document.getElementById('admin-tempo')).value)
  };
  try {
    const r = await fetch('/api/rooms', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body: JSON.stringify(payload) });
    const d = await r.json();
    if (!r.ok) { if(msg) msg.textContent = d.erro || 'Erro'; return; }
    if(msg) msg.textContent = `Criado: ${d.room.nome} (${d.room.status})`;
    (e.target).reset();
    carregarSalas(); carregarAdmin();
  } catch { if(msg) msg.textContent = 'Falha de rede'; }
});

async function carregarAdmin() {
  const grid = document.getElementById('admin-grid');
  const emptyEl = document.getElementById('admin-empty');
  if (!grid) return;
  grid.innerHTML = `<div class="state state-loading"><span class="spinner"></span> Carregando salas...</div>`;
  try {
    const r = await fetch('/api/rooms', { credentials:'same-origin' });
    const d = await r.json();
    const rooms = d.rooms || [];
    if (!rooms.length) { grid.innerHTML=''; if(emptyEl) emptyEl.style.display='block'; return; }
    if(emptyEl) emptyEl.style.display='none';
    grid.innerHTML = rooms.map((s)=>{
      const assuntos = (()=>{ try{return JSON.parse(s.assuntos||'[]').join(', ')}catch{return ''}})();
      return `<div class="card" style="display:flex; flex-direction:column; gap:8px">
        <div style="display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap">
          <strong>${escapeHTML(s.nome)}</strong>
          <span class="badge">${s.status}</span>
        </div>
        <small style="color:var(--muted)">${escapeHTML(s.descricao) || ''} • ${s.materia_id||'geral'} • ${escapeHTML(assuntos)} • ${s.quantidade}Q • ${s.tempo_por_questao}s</small>
        ${s.codigo?`<small style="color:var(--primary)">Código: ${escapeHTML(s.codigo)}</small>`:''}
        <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px">
          <button class="btn btn-ghost" style="padding:6px 10px; font-size:0.8rem" onclick="gerarIA('${s.id}')">Gerar IA</button>
          <button class="btn btn-ghost" style="padding:6px 10px; font-size:0.8rem" onclick="mudarStatus('${s.id}','REVIEW')">→ Review</button>
          <button class="btn btn-ghost" style="padding:6px 10px; font-size:0.8rem" onclick="mudarStatus('${s.id}','PUBLISHED')">→ Publish</button>
          <button class="btn btn-primary" style="padding:6px 10px; font-size:0.8rem" onclick="mudarStatus('${s.id}','ACTIVE')">→ Ativar</button>
          <button class="btn btn-ghost" style="padding:6px 10px; font-size:0.8rem" onclick="mudarStatus('${s.id}','CLOSED')">Fechar</button>
          <button class="btn btn-ghost" style="padding:6px 10px; font-size:0.8rem; color:var(--error)" onclick="deletarSala('${s.id}')">Excluir</button>
        </div>
        <div id="admin-msg-${s.id}" style="font-size:0.8rem; color:var(--muted)" aria-live="polite"></div>
      </div>`;
    }).join('');
  } catch { grid.innerHTML = `<div class="state state-error">Erro ao carregar salas admin.</div>`; }
}
document.getElementById('admin-refresh')?.addEventListener('click', carregarAdmin);
window.gerarIA = async (id)=>{
  const el = document.getElementById(`admin-msg-${id}`);
  if(el) el.textContent='Gerando com IA...';
  try{
    const r = await fetch(`/api/rooms/${id}/generate`,{ method:'POST', credentials:'same-origin' });
    const d = await r.json();
    if(!r.ok){ if(el) el.textContent = d.erro||'Erro'; return; }
    if(el) el.textContent = `Gerado: ${d.quantidade} questões via ${d.provedor}`;
    carregarAdmin();
  }catch{ if(el) el.textContent='Falha'; }
};
window.mudarStatus = async (id, st)=>{
  const el = document.getElementById(`admin-msg-${id}`);
  if(el) el.textContent=`Alterando para ${st}...`;
  try{
    const r = await fetch(`/api/rooms/${id}/status`,{ method:'POST', headers:{'Content-Type':'application/json'}, credentials:'same-origin', body:JSON.stringify({status:st}) });
    const d = await r.json();
    if(!r.ok){ if(el) el.textContent = d.erro||'Erro'; return; }
    if(el) el.textContent = `Status: ${d.room.status}`;
    carregarSalas(); carregarAdmin();
  }catch{ if(el) el.textContent='Falha'; }
};
window.deletarSala = async (id)=>{
  if(!confirm('Excluir esta sala?')) return;
  const r = await fetch(`/api/rooms/${id}`,{ method:'DELETE', credentials:'same-origin' });
  const d = await r.json();
  if(!r.ok){ alert(d.erro||'Erro'); return; }
  carregarSalas(); carregarAdmin();
};
