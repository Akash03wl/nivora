# NIVORA — manutenção e validação local

## Projeto e escopo

- Pasta confirmada: `C:\Users\walac\Documents\projetos w.l\nivora`.
- Remoto: `https://github.com/Akash03wl/nivora.git`; branch `main`; HEAD inicial `4599871`.
- Havia 23 arquivos rastreados modificados e novos arquivos de interface, e-mail, testes e migração. Foram preservados, sem reset, checkout, commit, push ou deploy.
- `.freebuff/run.md` documenta a prévia no próprio checkout. Isso comprova uso da ferramenta, mas não a autoria de cada alteração. Os commits consultados identificam Akash03wl; as alterações locais são de autoria não confirmada.
- README e comentário da migração inicial citam Quiz AKE apenas para documentar a separação. Nenhum arquivo dos projetos vizinhos foi editado.
- Não foram encontrados AGENTS.md aplicáveis na inspeção inicial.

## Estrutura e execução

Frontend estático em `public/`, SPA em JavaScript sem framework; Hono/TypeScript em `src/`; Cloudflare Worker com Assets, D1 e Workers AI. `src/index.ts` monta autenticação, salas, tentativas e histórico. Migrações SQL em `migrations/`. Vitest executa APIs contra SQLite em memória. `npm run dev` inicia Wrangler; `npm run build` apenas empacota com `--dry-run`; `npm run deploy` publica e não foi executado.

O projeto usa Workers diretamente. Não foi criado um novo Site, trocado o provedor, nem adicionado `.openai/hosting.json`.

## Evidências e correções

| Prioridade | Problema confirmado | Evidência | Correção |
|---|---|---|---|
| P1 | Cadastro público podia criar administrador pelo primeiro cadastro ou e-mail alegado | `src/routes/auth.ts`, ramo de definição de papel | Produção cadastra USER; ADMIN existente é preservado. Primeiro administrador automático só em desenvolvimento explícito. |
| P1 | Filtro de status revelava rascunhos | `GET /api/rooms?status=DRAFT` substituía o filtro de autorização | Interseção obrigatória com estados públicos para não administradores. |
| P1 | Sala fechada revelava gabarito e podia ser reaberta | `rooms.ts`, rota questions + transição CLOSED→ACTIVE | Rota geral só entrega gabarito a ADMIN; resultado pessoal permanece disponível após finalizar. |
| P1 | Limite de abuso era contornado por concorrência | Teste reproduziu 20 autorizações para limite de 5 | UPSERT condicional atômico e recusa em falha do armazenamento. |
| P1 | Respostas, relógio e placar podiam ficar parcialmente gravados | Operações independentes em `attempts.ts` | Resposta e relógio na mesma transação; inserção condicionada à tentativa aberta; finalização verifica quantidade de respostas e grava scores na mesma transação. |
| P1 | Regeneração podia apagar questões antes de falhar ao inserir alternativas | DELETE seguido de INSERTs independentes | Transação para lote/alternativas/logs. Teste com falha injetada confirmou rollback e preservação do lote anterior. |
| P1 | Token de recuperação podia ser reutilizado em concorrência | Verificação e consumo separados | Troca condicionada a token válido, revogação de sessões e invalidação dos tokens na mesma transação. Teste concorrente: um sucesso, uma recusa. |
| P2 | Retomada reiniciava cronômetro visual | Contador iniciava sempre no limite total | Recuperação do horário persistido e cálculo por tempo decorrido; falha de retomada agora é mostrada. |
| P2 | Uma correção intermediária deixou o relógio sem atualização | Revisão final de `answer` | Corrigida antes da entrega; novos testes verificam avanço entre questões e rollback se o relógio falhar. |
| P2 | `null` virava alternativa zero; frações eram aceitas | Coerção por Number | `null` preservado e exigência de índice inteiro. |
| P2 | Sala vazia consumia uma tentativa | INSERT precedia a checagem de questões | Verificação antes da criação. |
| P2 | Botões administrativos/fechar dependiam de eventos inline | `onclick` incompatível com CSP `script-src 'self'` | Listeners externos, delegação com lista de ações permitidas e bloqueio de cliques repetidos. |
| P2 | Cabeçalhos do Worker não cobriam necessariamente assets | Assets servidos diretamente | `public/_headers` aplica CSP e cabeçalhos ao frontend. |
| P2 | JSON null/malformado, corpo excessivo e cookie inválido podiam gerar erros inadequados | Ausência de validação central; decodeURIComponent sem tratamento | Limite de 16 KiB, objeto JSON obrigatório, origem verificada quando enviada, erro JSON genérico e cookie inválido tratado como ausente. |
| P2 | Falha de IA podia produzir questões de demonstração em produção | Fallback mock-local | Produção falha explicitamente; demonstração continua apenas fora de produção. |
| P2 | Modelo Workers AI era reutilizado no OpenRouter e timeout não abortava requisição | `ai.ts` | `OPENROUTER_MODEL` separado, aborto efetivo e mensagens de log sem detalhes do provedor. |
| P2 | Aviso de questões fictícias desaparecia ao atualizar painel | Renderização substituía a mensagem | Feedback reaplicado após atualizar a lista. |
| P3 | Foco/seleção, movimento reduzido e menu móvel inconsistentes | Inspeção do frontend | Foco visível, aria-pressed, Escape no menu, suporte a movimento reduzido, quebra de texto e especificidade do botão mobile. |

## Validação executada

- Linha de base: 64 testes em 13 arquivos, antes das edições, aprovados.
- Suíte final: **83 testes aprovados em 14 arquivos**, incluindo 19 testes novos de auditoria. Executada em 10/09/2026 com Node 24.12.0.
- A suíte anterior de 80 testes havia passado, mas não cobria a atualização do relógio; os dois testes adicionais fecham essa lacuna. Não usar aquele resultado como prova isolada da versão final.
- `npm run typecheck`, `npm run check:frontend`, `npm run build` (Wrangler 4.127.1, dry-run) e `git diff --check`: aprovados. Não há configuração de lint; `check:frontend` verifica sintaxe e não substitui lint. Testes/build precisaram da execução local autorizada fora da restrição que impedia esbuild de ler a pasta pai.
- Seis migrações aplicadas com sucesso em um D1 local separado, com identificador fictício, fora do banco de desenvolvimento preexistente.
- Navegador: cadastro de administrador e aluno fictícios, geração local sem serviço externo, revisão, publicação/ativação da sala local, entrada pelo código, resposta, salto, resultado e ranking. Resultado observado: 1 acerto em 5, 100 pontos, 20%, posição 1.
- Inspeção desktop, celular 390×844 e tablet 768×1024. Sem overflow horizontal nas medições feitas. Console consultado durante esse fluxo sem erros/avisos capturados. Isso não é uma auditoria exaustiva de navegadores ou WCAG.
- Não foram usados banco remoto nem credenciais reais nos testes. Não foram disparados e-mails ou chamadas pagas de IA.
- Conferência final em 10/09: histórico persistido exibiu 1 simulado, 20%, 100 pontos e 1º lugar; menu em 390×844 abriu e fechou com Escape, devolvendo foco ao botão, ícone com 20px e sem overflow. Console sem erros/avisos capturados; observabilidade local agregada: 66 requisições com outcome `ok`. Isso não comprova disponibilidade de serviços externos.
- Varredura dos arquivos candidatos não encontrou padrões comuns de chaves privadas/tokens. `.env` e `.dev.vars` não estão rastreados. Arquivos temporários de teste ficaram fora do projeto; o pacote usa apenas `public/` e o Worker. Os arquivos preexistentes não publicados foram preservados.

## Pendências e riscos que exigem validação

1. **Antes de produção:** confirmar que existe um administrador legítimo no D1 remoto. A correção não rebaixa contas existentes nem promove contas novas; não confiar em `ADMIN_EMAIL` para criar privilégios.
2. **Integrações externas:** Workers AI/OpenRouter reais e entrega Resend não foram testados. Confirmar bindings, modelo, remetente verificado e secrets sem revelar valores; executar uma validação autorizada em homologação. Em produção sem IA funcional a geração será recusada.
3. **Migração:** não foi confirmado se `0006_faseB.sql` já está aplicada no remoto. Verificar antes de publicar; backup e ordem em DEPLOY.md.
4. **Concorrência administrativa:** múltiplas gerações simultâneas ou publicação enquanto a IA trabalha merecem teste dedicado em D1/homologação. Os testes de transação garantem rollback de falha, não cobrem todas as interações entre administradores.
5. **Regras preservadas:** resultados pessoais liberam gabarito após finalizar; múltiplas contas podem compartilhar respostas. Mudar essa política, impor verificação de e-mail ou restringir participantes requer decisão de produto. Não foi adicionada funcionalidade nova.
6. **Ranking:** a listagem foi alinhada ao cálculo pessoal existente: empate completo compartilha posição. A ordenação continua priorizando acertos, pontuação e tempo.
7. **Escala:** consultas por questão e por tentativa no histórico podem ser caras em turmas grandes. Não houve teste de carga ou atualização geral de dependências.
8. Arquivos preexistentes `.freebuff/` e `prod-index2.html` foram preservados. Não fazem parte dos assets servidos; devem ficar fora do commit de publicação. Não usar `git add .`.

## Arquivos principais

Backend: `src/index.ts`, `src/routes/auth.ts`, `src/routes/attempts.ts`, `src/routes/rooms.ts`, `src/lib/auth.ts`, `src/lib/rateLimit.ts`, `src/lib/ai.ts`, `src/lib/email.ts`.

Frontend: `public/js/app.js`, `public/index.html`, `public/css/style.css`, `public/_headers`. Mantidos o tema, tipografia e arquitetura existentes.

Validação: `tests/audit-regressions.test.ts`, adaptadores transacionais nos testes existentes e scripts em `package.json`. Nenhuma dependência nova ou atualização de versão foi necessária.
