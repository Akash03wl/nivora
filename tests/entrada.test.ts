import { describe, it, expect } from 'vitest';
import { proximaFaqAberta, formatarContagem, PERGUNTAS_FAQ } from '../public/js/faq.js';

describe('conteúdo da tela de entrada (public/js/faq.js)', () => {
  describe('proximaFaqAberta (accordion do FAQ — um item por vez)', () => {
    it('abre o item clicado quando nenhum está aberto', () => {
      expect(proximaFaqAberta(null, 'faq-conta')).toBe('faq-conta');
    });
    it('troca para o item clicado quando outro está aberto', () => {
      expect(proximaFaqAberta('faq-conta', 'faq-celular')).toBe('faq-celular');
    });
    it('fecha o item ao clicar nele de novo', () => {
      expect(proximaFaqAberta('faq-pagamento', 'faq-pagamento')).toBe(null);
    });
    it('alvo vazio fecha qualquer item aberto', () => {
      expect(proximaFaqAberta('faq-conta', '')).toBe(null);
      expect(proximaFaqAberta(null, '')).toBe(null);
    });
  });

  describe('formatarContagem (pt-BR, sem NaN/undefined na tela)', () => {
    it('usa singular para 1', () => {
      expect(formatarContagem(1, 'sala aberta', 'salas abertas')).toBe('1 sala aberta');
    });
    it('usa plural para mais de um', () => {
      expect(formatarContagem(4, 'sala aberta', 'salas abertas')).toBe('4 salas abertas');
    });
    it('zero usa o plural', () => {
      expect(formatarContagem(0, 'sala aberta', 'salas abertas')).toBe('0 salas abertas');
    });
    it('gera o plural por padrão com sufixo "s" quando não informado', () => {
      expect(formatarContagem(3, 'simulado')).toBe('3 simulados');
    });
    it('valor não numérico devolve string vazia — nunca "NaN"/"undefined"', () => {
      expect(formatarContagem('abc', 'sala', 'salas')).toBe('');
      expect(formatarContagem(undefined, 'sala', 'salas')).toBe('');
      expect(formatarContagem(null, 'sala', 'salas')).toBe('');
      expect(formatarContagem(-2, 'sala', 'salas')).toBe('');
    });
  });

  describe('PERGUNTAS_FAQ (conteúdo pronto, sem placeholder)', () => {
    it('tem as 4 perguntas combinadas com o documento', () => {
      const perguntas = PERGUNTAS_FAQ.map((f) => f.pergunta);
      expect(perguntas).toContain('Preciso pagar pra usar?');
      expect(perguntas).toContain('Como as perguntas são criadas?');
      expect(perguntas).toContain('Preciso ter conta?');
      expect(perguntas).toContain('Funciona no celular?');
      expect(PERGUNTAS_FAQ.every((f) => f.id && f.resposta)).toBe(true);
    });
  });
});