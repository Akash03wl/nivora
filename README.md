# NIVORA — Aprenda. Supere. Evolua.

> **Manutenção 2026-09-10:** correções locais e evidências em [docs/AUDITORIA-2026-09-10.md](docs/AUDITORIA-2026-09-10.md); ordem de publicação em [docs/PUBLICACAO-SEGURA.md](docs/PUBLICACAO-SEGURA.md). Em produção, cadastro cria USER e não promove pelo e-mail; o primeiro ADMIN automático existe somente em desenvolvimento explícito. O estado remoto não foi validado nesta manutenção. As contagens e checklists históricos abaixo não substituem os testes atuais.

> **Plataforma de estudos e simulados inteligentes com IA, ranking e evolução do conhecimento.**
> `CONHECIMENTO → PRÁTICA → DESEMPENHO → EVOLUÇÃO`

[![Deploy](https://img.shields.io/badge/Deploy-Cloudflare%20Workers-orange?logo=cloudflare)](https://nivora.walacefercundes132.workers.dev)
[![Tests](https://img.shields.io/badge/Tests-54%20passing-brightgreen?logo=vitest)](./tests)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](./src)
[![Hono](https://img.shields.io/badge/Hono-4.x-orange)](https://hono.dev)
[![D1](https://img.shields.io/badge/D1-SQLite-blue?logo=cloudflare)](./migrations)

**Live:** **https://nivora.walacefercundes132.workers.dev** · **API:** `/api/health`

**Domínio custom:** Para ter `https://nivora.app`, compre o domínio no Cloudflare Registrar e rode:
```bash
npx wrangler route add "nivora.app/*" --zone-name="nivora.app"
# ou Dashboard → Workers → nivora → Custom Domains → Add → nivora.app
```

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
| **Banco** | **Cloudflare D1** (SQLite) | 6 migrations (`users, rooms, questions, attempts, scores, subjects, ai_generations...`), índices, FKs, `UNIQUE(user,room)` |
| **IA** | **Workers AI** + **OpenRouter** | `src/lib/ai.ts` `AIService` trocável (`workers-ai` → `openrouter` → `mock-local`), prompt 10 passos, `validateQuestions()`, `regenerateQuestion()` limite 3, rate limit 5/min |
| **Auth** | **PBKDF2 100k** | `src/lib/auth.ts`, cookie `nivora_sessao` HttpOnly SameSite Lax Secure, `USER`/`ADMIN`; cadastro público de produção sempre cria `USER` |
| **Testes** | **Vitest** + `node:sqlite` | `tests/*.test.ts` (54 testes), `vitest run`, `tsc --noEmit` |

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
│  ├─ lib/               # config, scoring, validation, db, auth, ai, email, rateLimit
│  └─ routes/            # auth.ts, rooms.ts, attempts.ts, history.ts
├─ migrations/           # D1 SQL (0001_initial → 0006_faseB)
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
# Edite .dev.vars apenas com valores locais necessários; nunca versione o arquivo

# 5. Migrations
npm run db:migrate:local   # local (.wrangler/state)
npm run db:migrate         # remoto (precisa database_id)

# 6. Dev
npm run dev                # http://localhost:8787
npm test                   # vitest run (54 testes)
npx tsc --noEmit

# 7. Deploy
npm run deploy             # https://nivora.<sub>.workers.dev
```

---

## 🔐 Variáveis

Ver `.env.example`. Em produção use `wrangler secret put`:

```bash
npx wrangler secret put AI_API_KEY      # OpenRouter
npx wrangler secret put AI_BASE_URL     # https://openrouter.ai/api/v1
npx wrangler secret put OPENROUTER_MODEL # modelo do OpenRouter (opcional)
npx wrangler secret put RESEND_API_KEY  # E-mail transacional (recuperação de senha)
```

`RESEND_FROM` (remetente verificado, ex. `Nivora <nao-responder@nivora.app>`) também pode ir como segredo ou variável pública. Atenção: `wrangler secret put` publica uma nova versão imediatamente; consulte `docs/PUBLICACAO-SEGURA.md` antes de alterar produção.

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
| `POST` | `/api/auth/forgot` | — | Gera token e envia link por e-mail (Resend); em dev `http` expõe `tokenTeste` |
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
| `GET` | `/api/rooms/by-code/:codigo` | — | Sala pelo código de 6 letras (M6) |
| `POST` | `/api/rooms/:id/questions/:questionId/regenerate` | ADMIN | Regenera UMA questão (DRAFT/REVIEW) (M5) |
| `GET` | `/api/rooms/:id/result` | cookie | Resultado persistido + `porQuestao` com `explicacao` e `alternativas` |
| `GET` | `/api/me/history` | cookie | Histórico 100 tentativas com `posicao` |
| `GET` | `/api/me/stats` | cookie | `totalSimulados, taxa, porMateria, porAssunto` |

---

## 🧪 Testes

```bash
npm test          # 12 arquivos, 54 testes (Vitest + node:sqlite)
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
- [x] **Fase 9 — Segurança** (sanitização, headers, payload, rate limit)
- [x] **Fase 10 — UI/UX** (design system dark/light, acessibilidade)
- [x] **Fase 11 — Testes** (12 arquivos, 54 testes, `tsc --noEmit`)
- [x] **Fase 12 — Deploy** (`docs/DEPLOY.md`, verificação em produção)
- [x] **Auditoria A — Infra e segurança** (B1 binding `AI`, B2 mock aleatório + aviso, B4 gabarito em `PUBLISHED`, B5 token fora do JSON, B6 sanitização XSS, B11 headers únicos)
- [x] **Auditoria B — Lógica** (B8 tempo do servidor p/ bônus, B9 regenera índice certo, B10 `alternativa_idx < 4`, B12 corridas sem 500, B13 completa lote curto, B14 timeout real, B15 `randomUUID`, B16 rate limit por usuário, B17 posição única de ranking)
- [x] **Auditoria C — Recuperação de senha ponta a ponta** (B7/M7: envio por e-mail via Resend + telas esqueci/redefinir)
- [x] **Auditoria D — Execução do simulado na tela** (B3/M1: timer, envio por questão, retomada; M2: resultado com explicações)
- [x] **Auditoria E — Frontend completo** (M3 ranking, M4 histórico, M5 revisão admin, M6 código, M8 quantidade 5–50, M9 tema, M10 perfil)
- [x] **Auditoria F — Testes novos + revisão** (B2/B4/B9/B10/B12 + M5/M6)

---

## 🌿 Deploy Cloudflare

- **Workers:** `npx wrangler deploy` → `https://nivora.walacefercundes132.workers.dev` (full-stack)
- **Pages** (estático apenas, sem API) foi removido — `nivora.pages.dev` está ocupado globalmente; `nivora-doy/pages.dev` deletado. Use Workers ou compre `nivora.app` → `wrangler route add "nivora.app/*"`.

---

## 📄 Licença

Privado — em desenvolvimento ativo. Publicado em **https://nivora.walacefercundes132.workers.dev** (Workers + D1).
