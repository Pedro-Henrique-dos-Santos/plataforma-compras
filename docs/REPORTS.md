# Relatorios operacionais

## Escopo

O modulo de relatorios consolida compras de uma unica empresa ativa. O papel `REPORT_VIEWER` pode consultar e exportar; alteracoes permanecem restritas aos papeis operacionais.

## Filtros

- Periodo de emissao, com data inicial e final opcionais.
- Fornecedor.
- Departamento ou centro de custo, incluindo rateios.
- Categoria.
- Status da compra.

O status inicial e `REGISTERED`. A tela abre no mes corrente e permite limpar o periodo para consultar todo o historico.

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

`GET /api/reports/procurement.xlsx` aplica os mesmos filtros e gera um arquivo nativo do Excel com as abas `Resumo`, `Compras`, `Departamentos`, `Fornecedores`, `Categorias` e `Meses`. Datas, moedas, percentuais e numeros permanecem tipados para permitir filtros, formulas e tabelas dinamicas sem conversao manual.

O XLSX tambem neutraliza textos que poderiam ser interpretados como formulas. O relatorio e sempre produzido a partir do PostgreSQL da empresa ativa; a planilha de origem nao e consultada no momento da exportacao.

## Validacao

Os testes cobrem contratos, periodo invertido, consolidacao dos rateios, itens sem classificacao, protecao contra formulas e estrutura do arquivo XLSX. A homologacao deve comparar o total filtrado com a planilha de origem antes da virada para PostgreSQL.
