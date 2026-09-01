/**
 * NIVORA — Helpers D1
 * Sempre prepared statements com bind (nunca concatena SQL).
 */

export async function primeira<T = any>(db: D1Database, sql: string, ...params: unknown[]): Promise<T | null> {
  return (await db.prepare(sql).bind(...params).first()) as T | null;
}

export async function todas<T = any>(db: D1Database, sql: string, ...params: unknown[]): Promise<T[]> {
  const r = await db.prepare(sql).bind(...params).all();
  return (r.results as T[]) || [];
}

export async function executar(db: D1Database, sql: string, ...params: unknown[]) {
  return await db.prepare(sql).bind(...params).run();
}

export function novoId(prefix = ''): string {
  const r = Math.floor(Math.random() * 1e9).toString(36);
  const s = Date.now().toString(36);
  return `${prefix}${r}${s}`;
}
