/**
 * NIVORA — Validação de entradas (sem confiar no frontend)
 */

import { LIMITES } from './config.js';

export function limparTexto(texto: unknown, max?: number): string {
  if (typeof texto !== 'string') return '';
  let t = texto.replace(/<[^>]*>/g, ' ').replace(/[<>]/g, ' ').trim();
  if (max) t = t.slice(0, max);
  return t;
}

export function validarTexto(campo: string, texto: unknown, min: number, max: number, obrigatorio = true) {
  const t = limparTexto(texto, max);
  if (obrigatorio && !t) return { ok: false as const, erro: `${campo} é obrigatório.` };
  if (min && t.length < min) return { ok: false as const, erro: `${campo} deve ter pelo menos ${min} caracteres.` };
  return { ok: true as const, valor: t };
}

export function validarEmail(email: unknown) {
  const e = String(email || '').trim().toLowerCase();
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!e || e.length > 120 || !re.test(e)) return { ok: false as const, erro: 'E-mail inválido.' };
  return { ok: true as const, valor: e };
}

export function validarSenha(senha: unknown) {
  if (typeof senha !== 'string' || senha.length < 8) return { ok: false as const, erro: 'A senha deve ter pelo menos 8 caracteres.' };
  if (senha.length > 72) return { ok: false as const, erro: 'Senha muito longa.' };
  return { ok: true as const, valor: senha };
}

export function validarNick(nick: unknown) {
  return validarTexto('Nick', nick, 2, 30, true);
}

const DIFICULDADES_VALIDAS = ['facil', 'medio', 'dificil', 'muito_dificil', 'personalizado'];
export function validarDificuldade(d: unknown) {
  const v = String(d || '').trim();
  if (!DIFICULDADES_VALIDAS.includes(v)) return { ok: false as const, erro: 'Dificuldade inválida.' };
  return { ok: true as const, valor: v };
}
