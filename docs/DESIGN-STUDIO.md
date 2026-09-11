# NIVORA — integração do novo design

Integração local da branch manutencao/nivora-2026-09-10 com a identidade visual do estúdio de estudos. O usuário autorizou nesta conversa merge, push e publicação após validação das atualizações.

## Mudanças

- Identidade em azul profundo e verde-lima, tipografia Plus Jakarta Sans, navegação lateral e menu móvel.
- Login, salas, prova, resultado, revisão, ranking e progresso usam as mesmas superfícies e temas claro/escuro.
- Busca por nome, descrição e assunto, sem distinção de acentos, e filtro por matéria.
- Removida a espera mínima artificial de três segundos na abertura.
- Mensagens de início/retomada ficam visíveis fora da prova; recomendações não classificam um assunto com 100% como ponto fraco.
- Preservadas as correções de autenticação, autorização, pontuação no servidor e proteção do gabarito da manutenção.

## Validação

- Suíte integrada: 83 testes em 14 arquivos aprovados; tipos, sintaxe dos três módulos frontend e build de ensaio aprovados.
- Navegador local: cadastro fictício, entrada, cinco respostas, finalização, resultado com explicações, ranking, histórico e revisão administrativa verificados.
- Usuário fictício permaneceu USER durante a prova. Promoção exclusivamente no banco local permitiu conferir a revisão administrativa sem acionar IA.
- Ranking móvel a 390 pixels sem overflow horizontal; visual também conferido em desktop.
- Nenhum teste foi gravado no banco remoto.

## Publicação e limites

Destino existente: Worker nivora, https://nivora.walacefercundes132.workers.dev, repositório Akash03wl/nivora, branch main.

A consulta remota encontrou a migração 0006 aplicada, a coluna attempts.ultima_resposta_em e um administrador existente. Nenhuma alteração remota de schema é necessária. Versão anterior do Worker: 834c671b-30a4-46e4-85e5-1a108183a8fd. Rollback do Worker não altera o banco.

Recuperação por e-mail depende de RESEND_API_KEY e remetente verificado; a consulta de nomes de secrets encontrou apenas ADMIN_EMAIL. Entrega de e-mail não está operacional nem foi validada. Workers AI possui binding, mas geração real não foi acionada nesta validação para evitar consumo. Estas integrações não devem ser descritas como testadas de ponta a ponta.

Arquivos .freebuff/, prod-index2.html, gh auth login e stop são preexistentes e ficam fora do commit. Não foram removidos.
