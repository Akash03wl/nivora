# Expansão temática ENEM

24 novos simulados, 120 questões autorais; catálogo combinado: 36 simulados e 180 questões. Cinco alternativas e explicação em cada item, sem limite de tempo. Não são transcrições de provas anteriores nem simulados completos do exame.

## Assuntos

- Matemática: porcentagem, função afim, probabilidade, estatística, geometria plana, razão e proporção.
- Física: cinemática, calorimetria, circuitos elétricos, ondulatória.
- Química: soluções e concentração, estequiometria, separação de misturas, funções orgânicas.
- Biologia: ecologia, genética mendeliana, citologia, fotossíntese.
- Português: interpretação de texto, coesão textual, variação linguística.
- Humanas: cartografia, urbanização, Revolução Industrial.

Os títulos e assuntos alimentam a busca existente, inclusive sem acentos. Nenhuma mudança de interface ou autenticação foi necessária. A lista de assuntos de cada sala agora elimina repetições.

## Pesquisa e revisão

Referências conceituais consultadas durante a preparação, sem cópia dos exercícios:

- [Inep — matriz de referência](https://www.gov.br/inep/pt-br/centrais-de-conteudo/acervo-linha-editorial/publicacoes-institucionais/avaliacoes-e-exames-da-educacao-basica/matrizes-de-referencia-enem).
- [OpenStax — funções lineares](https://openstax.org/books/college-algebra/pages/4-1-linear-functions).
- [OpenStax — fotossíntese](https://openstax.org/books/biology-2e/pages/8-1-overview-of-photosynthesis) e [fixação de carbono](https://openstax.org/books/biology-2e/pages/8-3-using-light-energy-to-make-organic-molecules).
- [OpenStax — álcoois e éteres](https://openstax.org/books/chemistry-2e/pages/20-2-alcohols-and-ethers) e [grupos funcionais](https://openstax.org/books/organic-chemistry/pages/3-1-functional-groups).
- [OpenStax — Primeira Revolução Industrial](https://openstax.org/books/world-history-volume-2/pages/6-3-capitalism-and-the-first-industrial-revolution).
- [IBGE — introdução à cartografia](https://biblioteca.ibge.gov.br/visualizacao/livros/liv64669_cap2.pdf).

Enunciados, alternativas e explicações revisados na elaboração. Testes conferem cálculos numéricos por fórmulas independentes, ausência de enunciados idênticos nos 180 itens, cinco alternativas distintas, integridade referencial e reaplicação do lote sem duplicar ou modificar itens anteriores. Quatro explicações curtas foram ampliadas antes da versão final. Isso não equivale a revisão independente por professores ou garantia absoluta de ausência de erros. Conteúdo de fundamentos para reforço, sem cobertura integral do ENEM.

## Operação

Fonte: `content/enem-topicos.mjs`. Gerador: `node scripts/seed-enem-topicos.mjs`. SQL: `content/enem-topicos.sql`, fora da pasta pública. Prefixo exclusivo `nivora_enem_v3_`.

Aplicar localmente antes de publicar: `npx.cmd wrangler d1 execute nivora-db --local --file content/enem-topicos.sql`. Após verificação, aplicar com `--remote`. Somente inclusões idempotentes, sem alteração de schema, usuários ou histórico. Uma nova execução não atualiza explicações já importadas; revisões de itens existentes exigem avaliar tentativas antes de alteração.

Para suspender o lote, arquivar as novas salas no painel, preservando tentativas. Não excluir dados de alunos. Os arquivos de conteúdo não são assets do Worker; gabaritos seguem as permissões existentes.

## Validação em 17/09/2026

89 testes passaram; tipos, sintaxe do frontend e build verificados. No navegador local, Porcentagem foi concluído com 5/5 e as cinco explicações exibidas, sem erros ou avisos no console. A busca por genetica encontrou Genética mendeliana. Validação de navegador por amostragem, não execução manual dos 24 simulados.

Publicação concluída em 17/09/2026 via importação aditiva no D1. Consultas remotas confirmaram 36 simulados ativos ENEM, 180 questões e 24 salas do lote novo. A página pública mostrou 36 salas abertas. Não foi realizado teste autenticado em produção; o fluxo completo foi testado somente no ambiente local.
