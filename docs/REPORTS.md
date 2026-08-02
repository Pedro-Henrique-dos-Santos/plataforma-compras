# Relatorios operacionais

## Escopo

O modulo de relatorios consolida compras de uma unica empresa ativa. O papel `REPORT_VIEWER` pode consultar e exportar; alteracoes permanecem restritas aos papeis operacionais.

## Filtros

- Periodo de emissao, com data inicial e final opcionais.
- Fornecedor.
- Departamento ou centro de custo, incluindo rateios.
- Categoria.
- Status operacional da compra, quando desejado.
- Etapa do Kanban.

A tela abre em todo o historico, sem restringir o status, e permite informar um
periodo quando a analise precisar de um mes ou intervalo especifico. Compras sem
data entram no historico geral e no grupo `Sem data`; filtros de periodo as
excluem porque nao existe uma emissao a atribuir ao intervalo. A etapa permite
distinguir solicitacoes, aprovacoes pendentes, pedidos formalizados, notas
faturadas, recebimentos e processos concluidos.

## Indicadores e agrupamentos

- Valor comprado.
- Economia negociada e percentual sobre o valor bruto.
- Ticket medio.
- Quantidade de compras e fornecedores.
- Totais e economias por fornecedor, categoria, departamento e mes.

Uma compra sem centro de custo aparece em `Sem centro de custo`. Quando existe rateio, cada departamento recebe o valor exato da respectiva alocacao. A economia e distribuida proporcionalmente apenas para a analise departamental.

## Exportacao

`GET /api/reports/procurement.csv` usa os mesmos filtros de `GET /api/reports/procurement`. O arquivo possui BOM UTF-8, separador `;`, valores monetarios com virgula decimal e cabecalhos em portugues.

Antes da serializacao, quebras de linha sao removidas e valores iniciados por `=`, `+`, `-` ou `@` recebem um apostrofo. Essa protecao evita que nomes vindos da base sejam executados como formulas ao abrir o arquivo no Excel.

`GET /api/reports/procurement.xlsx` aplica os mesmos filtros e gera o Excel resumido com as abas `Resumo`, `Compras`, `Departamentos`, `Fornecedores`, `Categorias` e `Meses`. A aba de compras identifica a etapa atual do Kanban.

`GET /api/reports/procurement-detailed.xlsx` gera o Excel detalhado. Alem das seis abas gerenciais, o arquivo inclui `Compras detalhadas`, `Itens detalhados`, `Itens por mes`, `Rateios`, `Parcelas`, `Notas fiscais` e `Dados fornecedores`. A consolidacao mensal de itens informa quantidade, numero de compras, fornecedores, gasto, economia e preco medio por descricao e unidade. A compra detalhada tambem identifica a etapa.

Datas, moedas, percentuais, quantidades e numeros permanecem tipados para permitir filtros, formulas e tabelas dinamicas sem conversao manual. Quando a emissao nao existe, a celula recebe `Sem data` em vez de uma data sintetica ou uma celula silenciosamente vazia.

O XLSX tambem neutraliza textos que poderiam ser interpretados como formulas. O relatorio e sempre produzido a partir do PostgreSQL da empresa ativa; a planilha de origem nao e consultada no momento da exportacao.

## Contas a pagar

`GET /api/payables` consolida somente a empresa ativa e aceita periodo de
vencimento, fornecedor, status, canal de pagamento e etapa da compra. O retorno
separa valores abertos, vencidos, pagos, sem programacao e a vencer em 7, 15 e
30 dias.

`GET /api/payables/export.xlsx` aplica os mesmos filtros e gera as abas
`Resumo financeiro` e `Contas a pagar`. A exportacao inclui pedido, nota, fornecedor,
parcela, vencimento, valor, situacao, forma, referencia de pagamento e etapa.
Uma compra aprovada sem parcela aparece como `UNSCHEDULED` e pode receber uma
conta unica pelo valor integral antes da exportacao.

Esse relatorio acompanha obrigacoes e previsoes. Ele nao comprova pagamento
bancario nem substitui conciliacao por extrato ou webhook do provedor.

## Validacao

Os testes cobrem contratos, periodo invertido, consolidacao dos rateios, itens
sem classificacao, compras sem data, protecao contra formulas, etapa do Kanban e
a estrutura dos arquivos XLSX. A homologacao deve comparar o total filtrado com
a planilha de origem antes da virada para PostgreSQL e reconciliar contas a
pagar com as parcelas aprovadas.
