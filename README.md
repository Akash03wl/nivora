# NIVORA — Aprenda. Supere. Evolua.

> **Plataforma de estudos e simulados inteligentes com IA, ranking e evolução do conhecimento.**
> `CONHECIMENTO → PRÁTICA → DESEMPENHO → EVOLUÇÃO`

[![Deploy](https://img.shields.io/badge/Deploy-Cloudflare%20Workers-orange?logo=cloudflare)](https://nivora.walacefercundes132.workers.dev)
[![Tests](https://img.shields.io/badge/Tests-39%20passing-brightgreen?logo=vitest)](./tests)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](./src)
[![Hono](https://img.shields.io/badge/Hono-4.x-orange)](https://hono.dev)
[![D1](https://img.shields.io/badge/D1-SQLite-blue?logo=cloudflare)](./migrations)

**Live:** **https://nivora.walacefercundes132.workers.dev** · **API:** `/api/health`

---

## ✨ Visão

Nivora é uma plataforma web completa de **simulados** para estudantes, com:

- Contas e autenticação segura (PBKDF2 + sessões HttpOnly)
- Salas com 6 estados (`DRAFT`→`REVIEW`→`PUBLISHED`→`ACTIVE`→`CLOSED`→`ARCHIVED`)
- Geração de questões por IA (Workers AI / OpenRouter Gemini / mock fallback) com validação rigorosa
- Execução isolada por aluno, cronômetro validado no backend, correção no servidor
- Pontuação `100 + bônus 20` (mais acertos nunca perde), ranking por sala
- Histórico e estatísticas por matéria/assunto
- Preparada para produção na Cloudflare (Workers + D1 + Assets)

> Projeto **novo e independente** do `quiz-ake-v2` (preservado). Nenhum código copiado automaticamente.

---

## 🧩 Stack

| Camada | Tech | Detalhe |
|---|---|---|
| **Frontend** | `public/` HTML/CSS/JS | Design System Nivora (tokens, dark/light, Inter + Plus Jakarta Sans), SPA com `fetch` + `credentials:same-origin` |
| **Backend** | **Cloudflare Workers** + **Hono** | `src/index.ts`, `src/routes/*`, security headers, `Cache-Control: no-store` |
| **Banco** | **Cloudflare D1** (SQLite) | 5 migrations (`users, rooms, questions, attempts, scores, subjects, ai_generations...`), índices, FKs, `UNIQUE(user,room)` |
| **IA** | **Workers AI** + **OpenRouter** | `src/lib/ai.ts` `AIService` trocável (`workers-ai` → `openrouter` → `mock-local`), prompt 10 passos, `validateQuestions()`, `regenerateQuestion()` limite 3, rate limit 5/min |
| **Auth** | **PBKDF2 100k** | `src/lib/auth.ts`, cookie `nivora_sessao` HttpOnly SameSite Lax Secure, `USER`/`ADMIN`, `ADMIN_EMAIL` ou 1º usuário vira `ADMIN` |
| **Testes** | **Vitest** + `node:sqlite` | `tests/*.test.ts` (39 testes), `vitest run`, `tsc --noEmit` |

---

## 📁 Estrutura

```
nivora/
├─ public/               # Frontend estático (servido via Workers Assets)
│  ├─ index.html         # SPA + hero Nivora + modal auth + salas
│  ├─ css/style.css      # Tokens Nivora (primary #2D7FF9, secondary #0EA67B)
│  └─ js/app.js          # Auth + salas (fetch /api/*)
├─ src/
│  ├─ index.ts           # Hono app + security headers + mounts
│  ├─ lib/               # config, scoring, validation, db, auth, ai, rateLimit
│  └─ routes/            # auth.ts, rooms.ts, attempts.ts, history.ts
├─ migrations/           # D1 SQL (0001_initial → 0005_seeds)
├─ tests/                # Vitest (auth, rooms, ai, execution, ranking, history, db-schema...)
├─ wrangler.jsonc        # Workers + D1 (nivora-db) + vars
├─ package.json          # scripts dev/deploy/db:migrate/test
└─ .env.example          # vars locais
```

---

## 🚀 Começando

```bash
# 1. Instalar
npm install

# 2. Login Cloudflare (primeira vez)
npx wrangler login
npx wrangler whoami

# 3. Criar D1 (uma vez)
npx wrangler d1 create nivora-db
# → copie database_id para wrangler.jsonc → d1_databases[0].database_id

# 4. Vars locais
cp .env.example .dev.vars
# Edite .dev.vars: ADMIN_EMAIL=seu@email.com  (opcional)

# 5. Migrations
npm run db:migrate:local   # local (.wrangler/state)
npm run db:migrate         # remoto (precisa database_id)

# 6. Dev
npm run dev                # http://localhost:8787
npm test                   # vitest run (39 testes)
npx tsc --noEmit

# 7. Deploy
npm run deploy             # https://nivora.<sub>.workers.dev
```

---

## 🔐 Variáveis

Ver `.env.example`. Em produção use `wrangler secret put`:

```bash
npx wrangler secret put ADMIN_EMAIL
npx wrangler secret put AI_API_KEY      # OpenRouter
npx wrangler secret put AI_BASE_URL     # https://openrouter.ai/api/v1
```

`wrangler.jsonc` vars públicas: `ENVIRONMENT`, `APP_NAME`, `SITE_URL`, `AI_MODEL`, `SCORING_*`.

---

## 📡 API (Fases 2-8 implementadas)

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| `GET` | `/api/health` | — | Health + D1 check |
| `POST` | `/api/auth/register` | — | `{nick,email,senha}` → 201, nick/email únicos, 1º vira ADMIN |
| `POST` | `/api/auth/login` | — | → `Set-Cookie` HttpOnly |
| `POST` | `/api/auth/logout` | cookie | Revoga sessão |
| `GET` | `/api/auth/me` | cookie | Perfil |
| `PATCH` | `/api/auth/me` | cookie | `nick/avatar/senha` |
| `POST` | `/api/auth/forgot` | — | Gera token (só expõe em `http+dev`) |
| `POST` | `/api/rooms` | ADMIN | Criar sala (`nome, materia_id, assuntos, quantidade, dificuldade, tempo`) |
| `GET` | `/api/rooms` | — | Lista (USER vê `PUBLISHED/ACTIVE/CLOSED`) |
| `GET` | `/api/rooms/:id` | — | Detalhe (protege `DRAFT` só ADMIN) |
| `PATCH` | `/api/rooms/:id` | ADMIN | Editar (bloqueia se `ACTIVE`) |
| `DELETE` | `/api/rooms/:id` | ADMIN | Excluir (bloqueia se `ACTIVE`) |
| `POST` | `/api/rooms/:id/status` | ADMIN | Transição `DRAFT→REVIEW→PUBLISHED→ACTIVE→CLOSED→ARCHIVED` |
| `POST` | `/api/rooms/:id/generate` | ADMIN | IA gera questões (valida, persiste `questions`+`question_options`, economia `?force=1`, rate limit 5/min) |
| `GET` | `/api/rooms/:id/questions` | ADMIN/ ACTIVE | Lista questões (esconde `correta_idx` se `ACTIVE` e não-ADMIN) |
| `POST` | `/api/rooms/:id/start` | cookie | Inicia tentativa (1 por user, sala `ACTIVE`, retorna questões sem gabarito) |
| `POST` | `/api/rooms/:id/answer` | cookie | Registra resposta (valida tempo no backend, 409 se já respondida/finalizada) |
| `POST` | `/api/rooms/:id/finish` | cookie | Corrige no servidor (`pontuacao` anti-fraude), expõe gabarito só após |
| `GET` | `/api/rooms/:id/ranking` | — | Ranking por sala `acertos DESC, pontuacao DESC, tempo ASC` |
| `GET` | `/api/rooms/:id/result` | cookie | Resultado persistido + `porQuestao` com `explicacao` |
| `GET` | `/api/me/history` | cookie | Histórico 100 tentativas com `posicao` |
| `GET` | `/api/me/stats` | cookie | `totalSimulados, taxa, porMateria, porAssunto` |

---

## 🧪 Testes

```bash
npm test          # 10 arquivos, 39 testes (Vitest + node:sqlite)
npx tsc --noEmit  # TypeScript
```

---

## 📦 Fases do Prompt Mestre

- [x] **Fase 1 — Fundação** (Workers + D1 + design system)
- [x] **Fase 2 — Autenticação** (register/login/logout/me, nick único, PBKDF2, RBAC)
- [x] **Fase 3 — Banco** (migrations, índices, scores, seeds, FKs)
- [x] **Fase 4 — Simulados** (CRUD, 6 estados, código, logs)
- [x] **Fase 5 — IA** (prompt 10 passos, validação, regeneração limite 3, resiliência, economia)
- [x] **Fase 6 — Execução** (start/answer/finish isolado, cronômetro backend, 1 tentativa, gabarito protegido)
- [x] **Fase 7 — Pontuação** (100+20, ranking `acertos>pontuacao>tempo`, anti-fraude)
- [x] **Fase 8 — Histórico** (`/me/history`, `/me/stats` por matéria/assunto)
- [ ] **Fase 9 — Segurança**, **Fase 10 — UI/UX**, **Fase 11 — Testes**, **Fase 12 — Deploy** (próximas)

---

## 🌿 Deploy Cloudflare

- **Workers:** `npx wrangler deploy` → `https://nivora.walacefercundes132.workers.dev` (full-stack)
- **Pages** (estático apenas, sem API) foi removido — `nivora.pages.dev` está ocupado globalmente; `nivora-doy/pages.dev` deletado. Use Workers ou compre `nivora.app` → `wrangler route add "nivora.app/*"`.

---

## 📄 Licença

Privado — em desenvolvimento. Fase 12 terá deploy oficial.
