import { describe, it, expect } from 'vitest';
import { pontosDaQuestao, calcularResultado, ordenarRanking } from '../src/lib/scoring.js';

describe('scoring', () => {
  it('acerto rapido ganha bonus max', () => {
    expect(pontosDaQuestao(true, 3, 30)).toBe(120);
  });
  it('acerto lento ganha bonus reduzido', () => {
    const rapido = pontosDaQuestao(true, 3, 30);
    const lento = pontosDaQuestao(true, 25, 30);
    expect(lento).toBeGreaterThan(100);
    expect(lento).toBeLessThan(rapido);
  });
  it('erro = 0', () => {
    expect(pontosDaQuestao(false, 2, 30)).toBe(0);
  });
  it('calcularResultado agrega corretamente', () => {
    const r = calcularResultado([{ acertou: true, tempoGasto: 3 }, { acertou: false, tempoGasto: 10 }], 30);
    expect(r.acertos).toBe(1);
    expect(r.erros).toBe(1);
    expect(r.aproveitamento).toBe(50);
  });
  it('ordenarRanking: mais acertos sempre vence', () => {
    const lista = [
      { acertos: 2, pontuacao: 300, tempo_total: 10 },
      { acertos: 3, pontuacao: 200, tempo_total: 100 },
      { acertos: 3, pontuacao: 250, tempo_total: 80 }
    ];
    const ord = ordenarRanking(lista);
    expect(ord[0].pontuacao).toBe(250); // 3 acertos 250 > 3 acertos 200
    expect(ord[2].acertos).toBe(2);
  });
});
