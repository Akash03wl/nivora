# NIVORA: reforço ENEM

## Revisão e mudanças

Repositório confirmado: Akash03wl/nivora, main. Base 96502f5; arquivos não relacionados preservados. A revisão desta atualização cobriu entrada, catálogo, execução, resultado, histórico, fontes de conteúdo e contratos das rotas envolvidas. Não equivale a uma nova auditoria independente de toda a infraestrutura.

| Evidência anterior | Impacto | Mudança |
| --- | --- | --- |
| Home priorizava salas e chamadas de ranking | Foco em competição, pouco direcionamento | Painel com próximo passo, retomada e atalhos por matéria |
| Erros acessíveis apenas no resultado individual | Revisão fragmentada | Caderno pessoal com erros e itens em branco; explicação expansível |
| Somente 6 treinos / 30 questões | Pouca variedade | Segunda série autoral: total de 12 treinos / 60 questões |
| FAQ atribuía todo conteúdo a IA | Origem imprecisa | Texto distingue treinos autorais e provas oficiais |
| Histórico não verificava falhas HTTP antes de renderizar | Erro poderia parecer ausência de dados | Verificação explícita das respostas |
| Importador comparava quebras de linha literalmente | Falhas em checkout Windows | Normalização no teste |

A recomendação é uma regra transparente: retomar tentativa ativa; caso contrário, escolher um treino não concluído na matéria da dúvida mais recente; sem essa correspondência, escolher outro disponível. Não é diagnóstico pedagógico nem plano diário adaptativo. Caderno mostra até 100 dúvidas recentes, apenas de tentativas finalizadas do próprio usuário. Gabaritos ficam fora dos assets e a nova rota exige sessão e retorna no-store.

## Referências

- [Me Salva — plano de estudos](https://www.mesalva.com/enem-e-vestibulares/plano-de-estudos): referência para organizar a experiência em estudo orientado, prática e acompanhamento.
- [Descomplica — ENEM](https://descomplica.com.br/vestibulares/enem/): referência de separação entre estudos, exercícios e simulados. Não copiamos layouts, textos, banco de questões ou promessas comerciais.
- [Inep — provas e gabaritos](https://www.gov.br/inep/pt-br/areas-de-atuacao/avaliacao-e-exames-educacionais/enem/provas-e-gabaritos): link disponível no rodapé. Download direto da matriz novamente retornou 502; não declaramos leitura integral desse PDF.
- OpenStax: [memória imune](https://openstax.org/books/biology-2e/pages/42-2-adaptive-immune-response), [espelhos planos](https://openstax.org/books/university-physics-volume-3/pages/2-1-images-formed-by-plane-mirrors) e [cinética e superfície](https://openstax.org/books/chemistry-atoms-first/pages/17-2-factors-affecting-reaction-rates) para checagem conceitual dos novos exercícios.

## Conteúdo e limites

`content/enem-aplicacao.mjs`: 30 novos itens, cinco alternativas cada. Revisão dos cálculos: 300/4×10=750 g; 8×5/2=20 caixas; (6×2+8×3)/5=7,2; 30/120=25%; 2×1,5×1=3 m³; 0,01×100=1 kWh; 12/4=3 m/s²; 2×10×3=60 J; 2+2=4 m; 600/0,02=30000 Pa; 10/0,5=20 g/L; 12+32=44 g; 180/60=3 g/cm³. Demais itens conferidos quanto a uma alternativa defensável, contexto e explicação.

São exercícios introdutórios autorais de reforço, não reproduções de anos anteriores nem simulados completos de 180 questões. Ainda faltam cobertura integral do programa, revisão independente por professores, redação e idiomas estrangeiros. Não há promessa de TRI, aprovação, tutor por IA ou videoaulas. Ranking e pontuações antigos foram preservados no servidor, mas retirados do destaque da experiência de estudo.

## Publicação

Sem alteração de schema. Gerar o lote com `node scripts/seed-enem-aplicacao.mjs`; validar localmente e executar `npx.cmd wrangler d1 execute nivora-db --remote --file content/enem-aplicacao.sql`. IDs `nivora_enem_v2_*`, somente adições idempotentes; nenhum UPDATE/DELETE. Publicar com o processo existente do Worker. Para suspender conteúdo, arquivar as novas salas, preservando tentativas. Não reverter para uma versão do servidor que descarte a alternativa E.

## Validação executada

Base: 85 testes passaram. Final: 86 testes em 15 arquivos passaram, incluindo isolamento do caderno entre usuários, bloqueio para anônimos, não exposição de respostas em andamento e importação idempotente das duas séries. Typecheck, sintaxe de todos os módulos de frontend e build passaram. Sem lint configurado.

Navegador local: orientação da matéria, início da segunda série, resposta registrada, saída e retomada na questão 2, abertura da explicação no caderno e apresentação a 390 px sem transbordamento horizontal. Nenhum aviso/erro de console capturado. Dados fictícios locais. Lote de seis novos simulados importado em produção sem alteração de schema; testes de alunos não foram realizados em produção.
