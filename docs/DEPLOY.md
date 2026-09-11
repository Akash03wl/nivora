# NIVORA — Guia de Deploy (Fase 12)

> **Atualização 2026-09-10:** este documento descreve a implantação histórica. Os checklists abaixo não foram revalidados no remoto. Para esta atualização, seguir [PUBLICACAO-SEGURA.md](PUBLICACAO-SEGURA.md), especialmente cadastro administrativo, backup e ordem de migração. ADMIN_EMAIL não concede mais administração no cadastro público de produção.

> Produção: **https://nivora.walacefercundes132.workers.dev**  
> Repo: **https://github.com/Akash03wl/nivora**  
> Stack: Workers + D1 + Assets + Hono

---

## 1. Pré-requisitos

- Node 20+, Conta Cloudflare, `wrangler` 4.127+
- Login: `npx wrangler login` → `npx wrangler whoami`

---

## 2. Criar D1 (uma vez)

```bash
npx wrangler d1 create nivora-db
# Copie database_id → cole em wrangler.jsonc → d1_databases[0].database_id
```

Atual: `a32b91a4-a142-45ca-ab5d-0ad8249e87bf` (já criado)

---

## 3. Variáveis

**Locais** (`.dev.vars`, não commitado):
```ini
ENVIRONMENT=development
# AI_API_KEY=sk-or-...
# AI_BASE_URL=https://openrouter.ai/api/v1
# RESEND_API_KEY=re_...          (e-mail de recuperação de senha)
# RESEND_FROM=Nivora <nao-responder@seu-dominio.com>
```

**Produção** (Secrets — nunca em `wrangler.jsonc`, que vai para o Git):
```bash
npx wrangler secret put AI_API_KEY
npx wrangler secret put AI_BASE_URL
npx wrangler secret put OPENROUTER_MODEL
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put RESEND_FROM
# Vars públicas já em wrangler.jsonc: APP_NAME, SITE_URL, AI_MODEL, SCORING_*
```

---

## 4. Migrations

```bash
npm run db:migrate:local   # local (.wrangler/state)
npm run db:migrate         # remoto (precisa database_id)

# Verificar
npx wrangler d1 execute nivora-db --remote --command "SELECT name FROM d1_migrations;"
npx wrangler d1 execute nivora-db --remote --command "SELECT slug FROM subjects limit 3;"
```

Migrations: `0001_initial` (users, rooms, questions...), `0002_rate_limit`, `0003_password_reset`, `0004_indices_scores`, `0005_seeds`, `0006_faseB` (coluna `attempts.ultima_resposta_em` p/ tempo validado no servidor)

---

## 5. Testes locais

```bash
npm test          # 12 arquivos, 54 testes
npx tsc --noEmit
```

---

## 6. Deploy

```bash
npm run deploy
# ou npx wrangler deploy

# Verificar
curl https://nivora.walacefercundes132.workers.dev/api/health
# → {"ok":true,"db":"ok","env":"production"}

# Logs
npx wrangler tail
```

**Workers Assets:** `public/` servido automaticamente via `assets.directory` em `wrangler.jsonc`.

---

## 7. Domínio

- **Padrão (funciona sem comprar):** `https://nivora.walacefercundes132.workers.dev` (full-stack)
- **`nivora.pages.dev` está ocupado** (site japonês) — por isso `nivora-doy.pages.dev` foi gerado e deletado. Pages é estático (sem API) → **use Workers**.
- **Custom (recomendado):** Compre `nivora.app` no Cloudflare Registrar, depois:
  ```bash
  npx wrangler route add "nivora.app/*" --zone-name="nivora.app"
  # ou Dashboard → Workers → nivora → Custom Domains → Add → nivora.app
  # Atualize wrangler.jsonc vars.SITE_URL
  npx wrangler deploy
  ```

---

## 8. GitHub

```bash
git remote add origin https://github.com/Akash03wl/nivora.git
git push -u origin main
```

Repo já pushado (9a27226 → 0a49048). README com badges e fases.

---

## 9. Checklist Produção

- [x] D1 criado (`nivora-db`)
- [x] Migrations aplicadas (6/6 local e remote)
- [ ] Confirmar manualmente um `ADMIN` legítimo no D1 remoto; cadastro público de produção cria somente `USER`
- [x] Secrets `RESEND_API_KEY`/`RESEND_FROM` para recuperação de senha por e-mail
- [x] `ENVIRONMENT=production` → cookies `Secure`
- [x] `npm test` 54 pass, `tsc` 0 erros
- [x] Deploy `https://nivora.walacefercundes132.workers.dev` com `db:ok`
- [x] GitHub `Akash03wl/nivora` público

---

## 10. Rollback

```bash
npx wrangler deployments list
npx wrangler rollback <version-id>
```
