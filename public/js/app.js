// NIVORA — frontend base (Fase 1)
console.log('Nivora Fase 1 — Fundação');

// Verifica API health
fetch('/api/health').then(r=>r.json()).then(d=>console.log('health', d)).catch(()=>console.log('api offline (dev sem wrangler)'));
