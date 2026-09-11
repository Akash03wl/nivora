// Ícones de linha da tela de entrada — SVG inline, mesmo peso de traço (1.8),
// cor herdada via currentColor (--muted em repouso, --highlight no foco).
// Módulo puro (sem DOM), só strings.

const svg = (corpo) =>
  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${corpo}</svg>`;

export const ICONES = {
  // Passos do "Como funciona"
  entrar: svg('<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/>'),          // porta + seta entrando (escolher sala)
  ritmo: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),                                                              // relógio (responder no seu ritmo)
  entender: svg('<path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-4.2 10.3c.8.8 1.2 1.7 1.2 2.7h6c0-1 .4-1.9 1.2-2.7A6 6 0 0 0 12 3z"/>'), // lâmpada (entender cada resposta)
  evolucao: svg('<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>'),                                                            // gráfico subindo (evolução)

  // Cartões do "Por que estudar assim"
  revisadas: svg('<path d="M12 3l7 3v5c0 4.6-3 8.2-7 10-4-1.8-7-5.4-7-10V6z"/><path d="M9 12l2 2 4-4"/>'),                        // escudo com check (revisado)
  tempo: svg('<path d="M6 2h12"/><path d="M6 22h12"/><path d="M8 2c0 4.5 2.5 6 4 8-1.5 2-4 3.5-4 8h8c0-4.5-2.5-6-4-8 1.5-2 4-3.5 4-8"/>'), // ampulheta (cada um no seu tempo)
  explicado: svg('<path d="M12 5c-2-1.5-5-2-8-2v15c3 0 6 .5 8 2 2-1.5 5-2 8-2V3c-3 0-6 .5-8 2z"/><path d="M12 5v15"/>'),            // livro aberto (erro explicado)
  progresso: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>')                 // alvo (progresso por assunto)
};