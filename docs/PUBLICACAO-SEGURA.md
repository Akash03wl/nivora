# NIVORA — roteiro de publicação após a manutenção

Nenhum push, merge, deploy, secret ou banco remoto foi alterado. O checklist antigo de DEPLOY.md é histórico, não uma validação atual.

## Destino

Repositório `https://github.com/Akash03wl/nivora`, branch local `main`; Worker `nivora`; endereço configurado `https://nivora.walacefercundes132.workers.dev`; D1 `nivora-db`, binding `DB`; assets em `public/`. Preservar o identificador em `wrangler.jsonc`. Não criar outro banco nem alterar Quiz AKE.

## Verificações antes da autorização

1. Rever `AUDITORIA-2026-09-10.md` e o diff. Executar `npm test`, `npm run typecheck`, `npm run check:frontend`, `npm run build` e `git diff --check`. O build é dry-run e não publica. Não há lint configurado; check:frontend verifica sintaxe. A suíte requer Node com `node:sqlite`, não Node 20.
2. Confirmar administrador legítimo no D1 remoto. Em produção, cadastro público agora sempre cria USER; ADMIN_EMAIL não concede mais privilégios. Administradores existentes permanecem. Se não houver um, o operador deve verificar a identidade da conta e aprovar promoção pontual; não reativar bootstrap público.
3. Confirmar ENVIRONMENT=production, SITE_URL, DB e AI. AI_MODEL configura Workers AI; OPENROUTER_MODEL configura OpenRouter. AI_API_KEY/AI_BASE_URL e RESEND_API_KEY/RESEND_FROM devem permanecer em secrets, sem imprimir valores. Conferir remetente verificado.
4. Validar IA e entrega de e-mail reais em homologação, com autorização para possíveis custos. Sem IA funcional, produção recusa geração em vez de criar demonstrações.
5. Selecionar somente alterações revisadas para commit. Incluir os novos arquivos necessários: migrations/0006_faseB.sql, src/lib/email.ts, public/js/faq.js, public/js/icones.js, public/_headers, testes e documentação. Preservar alterações anteriores de autoria não confirmada.
6. Manter fora da seleção .dev.vars, .env reais, .wrangler/, node_modules/, dist/, .freebuff/, prod-index2.html e temporários. .env.example só entra após revisão de placeholders. Não usar git add indiscriminadamente.
7. Obter autorização explícita para publicar o conjunto revisado no Worker nivora. Push e merge também precisam de autorização, pois podem acionar publicação.

## Banco: ordem e backup

As migrações 0001–0006 foram aplicadas em D1 local isolado. A 0006 já existia como alteração local antes da manutenção; adiciona attempts.ultima_resposta_em e não apaga dados. Não foi aplicada no remoto nesta tarefa.

Após autorização:

1. Conferir migrações pendentes e PRAGMA table_info(attempts) no D1 remoto. Se a coluna existir sem registro correspondente no histórico de migrações, reconciliar antes de repetir ALTER TABLE.
2. Exportar nivora-db para armazenamento privado, verificar o backup e registrar a versão atual do Worker. O backup contém dados pessoais, hashes e sessões: nunca incluí-lo no Git ou em logs compartilhados.
3. Aplicar apenas migrações pendentes, em ordem, com `npm run db:migrate` (comando remoto). **Migração antes do novo Worker**, pois o código depende da coluna.
4. Confirmar coluna, histórico e integridade antes da publicação.

Rollback do Worker não reverte o D1. A coluna adicional pode permanecer ao voltar ao código anterior; não removê-la automaticamente. Restaurar backup exige janela de manutenção, autorização e avaliação da perda de gravações posteriores ao backup.

## Publicação autorizada

Executar `npm run deploy` somente após a autorização e as verificações acima. Conferir /api/health, assets/CSP, login existente, permissões administrativas e leitura de resultados. Não criar testes destrutivos em produção. Se necessário, voltar à versão anterior do Worker e avaliar o D1 separadamente.

Nenhuma compra de domínio, migração de framework ou troca de infraestrutura faz parte desta entrega.
