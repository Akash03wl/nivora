import { describe, it, expect } from 'vitest';
import { validarEmail, validarSenha, validarNick, validarDificuldade } from '../src/lib/validation.js';

describe('validation', () => {
  it('email valido/invalido', () => {
    expect(validarEmail('a@b.com').ok).toBe(true);
    expect(validarEmail('sem-arroba').ok).toBe(false);
  });
  it('senha minimo 8', () => {
    expect(validarSenha('1234567').ok).toBe(false);
    expect(validarSenha('12345678').ok).toBe(true);
  });
  it('nick obrigatorio', () => {
    expect(validarNick('').ok).toBe(false);
    expect(validarNick('Jo').ok).toBe(true);
  });
  it('dificuldade valida', () => {
    expect(validarDificuldade('facil').ok).toBe(true);
    expect(validarDificuldade('inexistente').ok).toBe(false);
  });
});
