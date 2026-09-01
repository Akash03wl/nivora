/**
 * NIVORA — Configuração central
 * Toda pontuação, limites e estados ficam aqui.
 * Não espalhar valores pelo código (regra #15).
 */

export const SCORING = {
  CORRETO: 100,
  VELOCIDADE_MAX: 20,
  ERRO: 0,
  TEMPO_RAPIDO_S: 5,
  TEMPO_LENTO_S: 30
} as const;

export const TEMPO_QUESTAO = {
  SEM_LIMITE: 0,
  S_15: 15,
  S_30: 30,
  S_45: 45,
  S_60: 60,
  S_120: 120,
  PADRAO: 30
} as const;

export const QUANTIDADES = [10, 20, 30, 40, 50] as const;

export const DIFICULDADES = {
  FACIL: 'facil',
  MEDIO: 'medio',
  DIFICIL: 'dificil',
  MUITO_DIFICIL: 'muito_dificil',
  PERSONALIZADO: 'personalizado'
} as const;

export const DIFICULDADE_LABEL: Record<string, string> = {
  facil: 'Fácil',
  medio: 'Médio',
  dificil: 'Difícil',
  muito_dificil: 'Muito difícil',
  personalizado: 'Personalizado'
};

export const DIFICULDADE_DESC: Record<string, string> = {
  facil: 'Conceitos básicos, identificação e aplicação simples.',
  medio: 'Interpretação, aplicação e raciocínio moderado.',
  dificil: 'Associação de conceitos e problemas mais complexos.',
  muito_dificil: 'Maior profundidade, interpretação, combinação de conhecimentos e resolução de problemas.',
  personalizado: 'Configuração livre definida pelo administrador.'
};

export const STATUS = {
  DRAFT: 'DRAFT',
  REVIEW: 'REVIEW',
  PUBLISHED: 'PUBLISHED',
  ACTIVE: 'ACTIVE',
  CLOSED: 'CLOSED',
  ARCHIVED: 'ARCHIVED'
} as const;

export const LIMITES = {
  MAX_TITULO: 80,
  MAX_DESCRICAO: 300,
  MAX_ENUNCIADO: 800,
  MAX_ALTERNATIVA: 300,
  MAX_EXPLICACAO: 800,
  MAX_ASSUNTOS: 12,
  MAX_QUESTOES: 50,
  MIN_QUESTOES: 5,
  MAX_TENTATIVAS_REGENERACAO: 3
} as const;

export const APP = {
  NAME: 'Nivora',
  SHORT_NAME: 'NIVORA',
  TAGLINE: 'Aprenda. Supere. Evolua.',
  DESCRIPTION: 'Plataforma de estudos e simulados com foco em conhecimento, desempenho e evolução.'
} as const;
