/**
 * NIVORA — Segurança (Fase 9)
 * Sanitização, limites de payload, headers.
 */

export function sanitizar(texto: string, max = 500): string {
  if (typeof texto !== 'string') return '';
  // Remove tags/script e limita
  return texto.replace(/<[^>]*>/g, ' ').replace(/[<>]/g, ' ').trim().slice(0, max);
}

export function payloadMuitoGrande(body: string, limite = 10000): boolean {
  return body.length > limite;
}

// Headers de segurança (já aplicados em src/index.ts, mas centralizados aqui)
export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'",
  'Cache-Control': 'no-store'
};
