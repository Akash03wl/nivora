# Catálogo de preparação ENEM — 11/09/2026

Seis salas de fundamentos: Português, Matemática, Biologia, Física, Química e Ciências Humanas. Cada sala tem cinco questões autorais, cinco alternativas por questão, uma resposta correta e explicação. Não são reproduções de itens oficiais, prova completa, previsão de incidência, nem cálculo de nota TRI. Português e Matemática ficam separados. Não houve chamada paga de geração por IA.

## Pesquisa e limites

A seleção considera as áreas e competências da [matriz de referência do Inep](https://www.gov.br/inep/pt-br/centrais-de-conteudo/acervo-linha-editorial/publicacoes-institucionais/avaliacoes-e-exames-da-educacao-basica/matrizes-de-referencia-enem). O [acervo oficial de provas e gabaritos](https://www.gov.br/inep/pt-br/areas-de-atuacao/avaliacao-e-exames-educacionais/enem/provas-e-gabaritos/2024) é referência para futuras inclusões de questões anteriores com ano/caderno/número. Downloads diretos de PDFs falharam nesta sessão; nenhum item foi apresentado como transcrição verificada dessas provas.

Referências conceituais consultadas:

- Biologia: [seleção natural e resistência](https://openstax.org/books/biology-2e/pages/18-1-understanding-evolution) e [fluxo de energia](https://openstax.org/books/biology-2e/pages/46-2-energy-flow-through-ecosystems), OpenStax. A taxa de 10% é hipótese explícita do exercício, não constante universal.
- Química: [molaridade e diluição](https://openstax.org/books/chemistry/pages/3-3-molarity) e [pH e pOH](https://openstax.org/books/chemistry-2e/pages/14-2-ph-and-poh), OpenStax.
- Humanas: [patrimônio imaterial](https://www.gov.br/iphan/pt-br/patrimonio-cultural/patrimonio-imaterial), Iphan; [indicadores ambientais](https://www.ibge.gov.br/biblioteca/visualizacao/livros/liv101623.pdf), IBGE.
- Português: textos e campanhas fictícios escritos para os exercícios, sem atribuição a autores reais; interpretação, coesão, variedade linguística, argumentação e funções da linguagem.

Revisão dos cálculos: descontos 250×0,8×0,9=180; escala 6×50000 cm=3 km; mediana 18; probabilidade (3/5)×(2/4)=3/10; tarifa (57−12)/3=15 km. Física: 5,5×(20/60)×30=55 kWh; 120/2,5=48 km/h; 500×4,2×20=42000 J; 10/20=0,5 A; 340/170=2 m. Química: 2×100/500=0,4 mol/L; 16 g CH4 exigem 64 g O2; −log10(10⁻³)=3. Genética Aa×Aa: 1/4 aa; energia: 10000×0,1²=100 kJ.

Revisados enunciados, distratores, unidades e explicações das 30 questões. Isso não substitui revisão independente por professores nem garante ausência absoluta de erros. O lote é introdutório; não cobre integralmente o programa do ENEM.

## Manutenção e publicação

Fonte: `content/enem-2026.mjs`. Gerar SQL com `node scripts/seed-enem.mjs`. Aplicar primeiro localmente: `npx.cmd wrangler d1 execute nivora-db --local --file content/enem-2026.sql`. Após testes, aplicar ao banco correto com `--remote` e publicar o Worker.

O lote usa IDs `nivora_enem_v1_*`, somente INSERT com conflito de ID ignorado. A reaplicação não duplica nem sobrescreve conteúdo. Não altera usuários, tentativas, respostas ou salas antigas. Não há migração de schema ou exclusão; o campo legado `codigo` permanece no banco para preservar os dados, mas a entrada e geração de códigos foram retiradas. Uma correção futura em questão já respondida exige avaliar o histórico antes de alterar o conteúdo; gerar SQL novamente não atualiza itens existentes.

As fontes de conteúdo e SQL ficam fora de `public`; não são assets do site. O gabarito continua entregue apenas pelas rotas autorizadas nos momentos previstos pelo fluxo existente. Para suspender o lote após publicação, arquivar as seis salas pelo painel administrativo, preservando tentativas. Não excluir questões de alunos.

## Verificação da implementação

85 testes em 15 arquivos passaram; verificação de tipos, sintaxe do frontend e build passaram. A navegação local revelou uma limitação anterior: o servidor descartava alternativas de índice 4 (E). A validação agora consulta as alternativas reais da questão. O teste de regressão confirma E, rejeição de índice inexistente e ocultação do gabarito para aluno.

No navegador local: busca por Química, início, cinco respostas, resultado 5/5 e explicações conferidos após a correção. Catálogo conferido em largura de celular (390 px), sem transbordamento horizontal; nenhum erro ou aviso de console capturado. Testes usam dados fictícios locais, não contas de produção. O lote foi importado no D1 de produção sem alterações de schema.
