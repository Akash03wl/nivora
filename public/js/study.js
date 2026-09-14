// Painel de reforço: usa exclusivamente o histórico autenticado do aluno.
export function initStudy({api, escapeHTML:e, start, result, home}) {
  const panel = document.getElementById('study-panel');
  let current = {review:[],completed:[],ongoing:[]};
  let rooms = [];
  let generation = 0;
  const tips = {
    portugues:'Leia o comando antes das alternativas. Volte ao texto para justificar sua escolha; diferencie o que está escrito do que você supõe.',
    matematica:'Anote os dados e a unidade pedida. Monte a relação, calcule e confira se a ordem de grandeza faz sentido.',
    biologia:'Identifique o processo biológico e a relação de causa e efeito. Evite explicações que atribuem intenção à evolução.',
    fisica:'Desenhe a situação, identifique as grandezas e converta as unidades antes de escolher a equação.',
    quimica:'Identifique as substâncias e as condições. Em cálculos, confira unidades, proporção e conservação da matéria.',
    humanas:'Situe o contexto histórico ou geográfico. Compare os argumentos do texto e evite generalizações fora da fonte.'
  };
  const names = {portugues:'Linguagens',matematica:'Matemática',biologia:'Biologia',fisica:'Física',quimica:'Química',humanas:'Ciências Humanas'};
  async function refresh(list = rooms) {
    rooms = list;
    const turn = ++generation;
    panel.innerHTML = '<p role="status">Preparando seu próximo passo…</p>';
    try {
      const {r,d} = await api('/api/me/study');
      if (turn !== generation) return;
      if(!r.ok) throw new Error();
      current = d;
      const pending = rooms.filter(s=>s.status==='ACTIVE' && !d.completed.includes(s.id));
      const weak = d.review[0]?.materia_id;
      const next = d.ongoing[0] || pending.find(s=>s.materia_id===weak) || pending[0];
      panel.innerHTML = `<div class="study-intro"><div><span class="eyebrow">SEU ESPAÇO DE REFORÇO</span><h2>O que vamos aprender hoje?</h2><p>Entenda a base, pratique e volte ao que precisa de atenção.</p></div><span class="study-count">${d.completed.length} simulados concluídos</span></div>
      <div class="study-columns"><article class="next-study"><span class="eyebrow">${d.ongoing.length?'CONTINUE DE ONDE PAROU':'PRÓXIMO PASSO SUGERIDO'}</span><h3>${e(next?.nome || 'Hora de consolidar o que aprendeu')}</h3><p>${d.ongoing.length ? `${next.respondidas} de ${next.total} questões registradas. Sua tentativa está salva.` : weak && next?.materia_id===weak ? 'Uma nova prática na matéria em que você tem questões para revisar.' : 'Comece com um treino curto. O resultado ajuda a escolher o que revisar depois.'}</p>${next?`<button class="btn btn-primary" data-study-start="${e(next.id)}">${d.ongoing.length?'Retomar estudo':'Preparar meu estudo'} ↗</button>`:'<a href="#review-notebook" class="btn btn-primary">Revisar minhas dúvidas</a>'}</article>
      <article class="study-method"><span class="eyebrow">UM CICLO SIMPLES</span><ol><li><strong>Prepare</strong><span>Leia a orientação da matéria.</span></li><li><strong>Pratique</strong><span>Resolva sem consultar o gabarito.</span></li><li><strong>Entenda</strong><span>Explique com suas palavras o que errou.</span></li></ol><p>O aproveitamento mostra sua prática aqui; não é uma estimativa da nota do ENEM.</p></article></div>
      <div class="subject-paths">${Object.entries(names).map(([id,name])=>`<button class="subject-path" data-study-subject="${id}"><span>${e(name)}</span><small>${rooms.filter(s=>s.materia_id===id && s.status==='ACTIVE').length} simulados disponíveis</small><span aria-hidden="true">↗</span></button>`).join('')}</div>
      <section id="review-notebook" class="review-notebook"><div class="study-intro"><div><span class="eyebrow">APRENDER COM AS DÚVIDAS</span><h2>Meu caderno de revisão</h2></div><span>${d.review.length}${d.review.length===100?'+':''} ${d.review.length===1?'questão':'questões'} para retomar</span></div><p>Erros e questões em branco dos seus simulados finalizados. Tente resolver novamente antes de abrir a explicação. Esta revisão não altera a pontuação.</p>
      ${d.review.length?`<label>Filtrar revisão por matéria <select id="review-subject" class="input"><option value="">Todas</option>${[...new Set(d.review.map(q=>q.materia_id))].map(id=>`<option value="${e(id)}">${e(names[id]||id||'Geral')}</option>`).join('')}</select></label><div id="review-items"></div>`:'<div class="study-empty">Nenhuma dúvida registrada ainda. Depois de concluir um simulado, os erros e as questões em branco aparecem aqui.</div>'}</section>`;
      drawReview();
      const filter = document.getElementById('review-subject');
      filter?.addEventListener('change',()=>drawReview(filter.value));
      document.querySelectorAll('#salas-grid [data-acao="entrar"]').forEach(btn=>{
        btn.textContent = d.completed.includes(btn.dataset.room)?'Revisar simulado':d.ongoing.some(s=>s.id===btn.dataset.room)?'Retomar estudo':'Preparar estudo';
      });
    } catch {
      if(turn===generation) panel.innerHTML='<p role="status">Não foi possível carregar seu painel. Seus dados continuam salvos.</p><button class="btn btn-ghost" data-study-retry>Carregar novamente</button>';
    }
  }
  function drawReview(subject='') {
    const host=document.getElementById('review-items');
    if(!host)return;
    host.innerHTML=current.review.filter(q=>!subject || q.materia_id===subject).map(q=>`<article class="review-item"><small>${e(q.room_nome)} · ${e(q.assunto)}</small><h3>${e(q.enunciado)}</h3><ol type="A">${q.alternativas.map(a=>`<li>${e(a.texto)}</li>`).join('')}</ol><details><summary>Entender a resolução</summary><p><strong>Resposta: ${String.fromCharCode(65+q.correta_idx)}.</strong> ${e(q.explicacao)}</p><p class="muted">Pergunte a si mesmo: qual informação ou conceito faltou na minha primeira tentativa?</p></details></article>`).join('');
  }
  function prepare(id) {
    const room=rooms.find(s=>s.id===id); if(!room)return;
    if(current.completed.includes(id)){result(id,room.nome);return;}
    if(current.ongoing.some(s=>s.id===id)){start(id,room.nome);return;}
    const dialog=document.getElementById('study-dialog');
    dialog.querySelector('h2').textContent=room.nome;
    dialog.querySelector('p').textContent=tips[room.materia_id]||'Leia o enunciado com atenção e identifique a informação pedida antes de responder.';
    dialog.querySelector('[data-study-go]').onclick=()=>{dialog.close();start(id,room.nome);};
    dialog.showModal();
  }
  panel.addEventListener('click',ev=>{
    const btn=ev.target.closest('button');if(!btn)return;
    if(btn.hasAttribute('data-study-retry'))refresh();
    if(btn.dataset.studyStart)prepare(btn.dataset.studyStart);
    if(btn.dataset.studySubject){home('salas');const sel=document.getElementById('room-subject');sel.value=btn.dataset.studySubject;document.getElementById('room-search').value='';sel.dispatchEvent(new Event('change'));}
  });
  document.getElementById('study-dialog').querySelector('[data-study-close]').onclick=()=>document.getElementById('study-dialog').close();
  function clear(){generation++;current={review:[],completed:[],ongoing:[]};panel.innerHTML='';document.getElementById('study-dialog').close();}
  return {refresh,prepare,clear};
}
