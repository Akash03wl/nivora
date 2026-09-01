# NIVORA — Aprenda. Supere. Evolua.

> Plataforma de estudos baseada em simulados, desempenho e evolução do conhecimento.

**Conceito:** CONHECIMENTO → PRÁTICA → DESEMPENHO → EVOLUÇÃO

## Visão
Nivora é uma plataforma web de **simulados inteligentes** com geração de questões por IA, salas, ranking, histórico e estatísticas — focada em evolução real do estudante.

## Stack
- **Frontend:** Cloudflare Pages (static) + Vite (previsto)
- **Backend:** Cloudflare Workers (Hono)
- **Banco:** Cloudflare D1 (SQLite)
- **IA:** Workers AI + OpenRouter/Gemini (provider trocável)
- **Auth:** PBKDF2 + sessões HttpOnly

## Status
- **Fase 0 — Análise:** concluída no projeto anterior (referência). Este repositório é **novo e independente** do `quiz-ake-v2`.
- Próximo: **Fase 1 — Fundação** (estrutura, config, banco, ferramentas)

> Este projeto foi criado separado do `quiz-ake-v2` para preservar o histórico do projeto antigo. Nenhum código foi copiado automaticamente.

## Estrutura prevista
```
nivora/
  src/
    index.ts       → Worker entry (Hono)
    lib/           → db, auth, scoring, ai
  migrations/      → D1 migrations (0001_initial.sql)
  public/          → frontend estático
  wrangler.jsonc
  package.json
```

## Variáveis de ambiente
Ver `.env.example`.

## Deploy
```bash
npm install
npm run dev        # wrangler dev
npm run deploy     # wrangler deploy
npm run db:migrate # aplicar migrations
```

## Licença
Privado — em desenvolvimento.
