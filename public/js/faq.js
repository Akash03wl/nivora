// FAQ da tela de entrada — módulo puro (sem DOM), testável em Node.
// Texto pronto do PROMPT "TELA INICIAL MAIS RICA".

export const PERGUNTAS_FAQ = [
  {
    id: 'faq-pagamento',
    pergunta: 'Preciso pagar pra usar?',
    resposta: 'Não. O Nivora é gratuito.'
  },
  {
    id: 'faq-perguntas',
    pergunta: 'Como as perguntas são criadas?',
    resposta: 'Os simulados ENEM contêm questões autorais de preparação, com explicações. Não são cópias de provas oficiais nem uma previsão da sua nota. As provas originais estão disponíveis no link do Inep no rodapé.'
  },
  {
    id: 'faq-conta',
    pergunta: 'Preciso ter conta?',
    resposta: 'Sim, mas o cadastro é rápido: só nick, e-mail e senha.'
  },
  {
    id: 'faq-celular',
    pergunta: 'Funciona no celular?',
    resposta: 'Sim — o Nivora foi pensado pra funcionar bem tanto no computador quanto no celular.'
  }
];

// Accordion do FAQ: só um item aberto por vez.
// Clicar no item já aberto fecha; clicar em outro troca; alvo vazio fecha tudo.
export function proximaFaqAberta(atual, alvo) {
  if (!alvo) return null;
  return atual === alvo ? null : alvo;
}

// Formata contagem no padrão pt-BR ("1 sala aberta", "5 salas abertas").
// Valores não numéricos (null/undefined/NaN/negativo) devolvem '' —
// nunca "NaN" nem "undefined" na tela.
export function formatarContagem(n, singular, plural) {
  const v = Number(n);
  if (n === null || n === undefined || !Number.isFinite(v) || v < 0) return '';
  const base = plural || singular + 's';
  return v === 1 ? `1 ${singular}` : `${v} ${base}`;
}