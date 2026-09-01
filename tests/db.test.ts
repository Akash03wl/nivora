import { describe, it, expect } from 'vitest';
import { novoId } from '../src/lib/db.js';

describe('db helpers', () => {
  it('novoId gera ids únicos', () => {
    const a = novoId('u_');
    const b = novoId('u_');
    expect(a).not.toBe(b);
    expect(a.startsWith('u_')).toBe(true);
  });
});
