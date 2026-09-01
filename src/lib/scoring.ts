/**
 * NIVORA — Motor de pontuação
 * Garante: mais acertos nunca fica abaixo de menos acertos.
 */

import { SCORING } from './config.js';

export function pontosDaQuestao(acertou: boolean, tempoGastoS: number, tempoLimiteS: number): number {
  if (!acertou) return SCORING.ERRO;
  let bonus = 0;
  if (tempoLimiteS && tempoLimiteS > 0) {
    const t = Math.max(0, Number(tempoGastoS) || 0);
    if (t <= SCORING.TEMPO_RAPIDO_S) bonus = SCORING.VELOCIDADE_MAX;
    else if (t < SCORING.TEMPO_LENTO_S) {
      const faixa = SCORING.TEMPO_LENTO_S - SCORING.TEMPO_RAPIDO_S;
      bonus = Math.round(SCORING.VELOCIDADE_MAX * (1 - (t - SCORING.TEMPO_RAPIDO_S) / faixa));
    }
  } else if (!tempoLimiteS) {
    const t = Number(tempoGastoS) || 0;
    if (t > 0 && t <= 10) bonus = Math.round(SCORING.VELOCIDADE_MAX * 0.5);
  }
  return SCORING.CORRETO + Math.max(0, bonus);
}

export function calcularResultado(
  respostas: Array<{ acertou: boolean; tempoGasto: number }>,
  tempoLimite: number
) {
  let acertos = 0;
  let erros = 0;
  let pontuacao = 0;
  let tempoTotal = 0;
  for (const r of respostas) {
    tempoTotal += Number(r.tempoGasto) || 0;
    if (r.acertou) {
      acertos++;
      pontuacao += pontosDaQuestao(true, r.tempoGasto, tempoLimite);
    } else {
      erros++;
      pontuacao += pontosDaQuestao(false, r.tempoGasto, tempoLimite);
    }
  }
  const total = acertos + erros;
  const aproveitamento = total ? Math.round((acertos / total) * 100) : 0;
  return { acertos, erros, total, pontuacao, tempoTotal, aproveitamento };
}

export function ordenarRanking<T extends { acertos: number; pontuacao: number; tempo_total?: number; tempoTotal?: number }>(
  lista: T[]
): T[] {
  return [...lista].sort((a, b) => {
    if (b.acertos !== a.acertos) return b.acertos - a.acertos;
    if (b.pontuacao !== a.pontuacao) return b.pontuacao - a.pontuacao;
    const ta = (a as any).tempo_total ?? (a as any).tempoTotal ?? 0;
    const tb = (b as any).tempo_total ?? (b as any).tempoTotal ?? 0;
    return ta - tb;
  });
}
