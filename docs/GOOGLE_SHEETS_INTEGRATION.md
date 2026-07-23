# Integracao com Google Sheets

## Objetivo

A integracao migra e reconcilia os cadastros da planilha durante a transicao para PostgreSQL. Nenhuma linha e gravada no banco antes de uma previa explicita.

## Abas esperadas

Por padrao, cada empresa configura estas quatro abas:

| Aba | Conteudo usado |
| --- | --- |
| `Cadastro de Fornecedores` | CNPJ, razao social, padroes e centro de custo |
| `Tabela de Precos Negociados` | item, unidade, valor inicial, negociado e vigencia |
| `Itens do Pedido` | pedido, nota fiscal, fornecedor, itens, valores e centro de custo |
| `Parcelas do Pedido` | pedido, vencimento e valor da parcela |

Se a aba `valores negociados` estiver presente, ela e lida como historico legado. Linhas que ja possuem o mesmo pedido ou nota nas abas normalizadas sao classificadas como duplicadas. Compras historicas sem numero de pedido recebem uma chave deterministica. A ausencia da data de emissao nao elimina a compra: ela e gravada com data nula, recebe uma observacao de origem e aparece como `Sem data` no sistema ate a correcao, sem inventar um mes.

Os nomes podem ser alterados na tela `Automacoes`. Os cabecalhos sao normalizados sem depender de acentos ou caixa, mas colunas obrigatorias ausentes interrompem a previa.

## Credencial de producao

1. Crie uma conta de servico em um projeto Google Cloud com a Google Sheets API habilitada.
2. Gere uma chave JSON exclusiva para o ambiente do servidor.
3. Configure `GOOGLE_SERVICE_ACCOUNT_JSON` ou `GOOGLE_SERVICE_ACCOUNT_JSON_BASE64` no servidor. Nunca use as duas ao mesmo tempo.
4. Compartilhe a planilha como leitora com o e-mail da conta de servico.
5. Mantenha a chave fora do GitHub, do navegador e das tabelas do banco.

O conector usa somente o escopo `spreadsheets.readonly`. A aplicacao nao solicita permissao de escrita e o fluxo de transicao continua unidirecional. O modo demonstracao usa um lote local isolado e nunca altera a planilha real.

Depois de salvar o ID e os nomes das abas na tela `Automacoes`, use `Verificar acesso`. Essa operacao valida a credencial, o compartilhamento da planilha e as quatro abas obrigatorias sem ler o lote completo, criar previa ou gravar dados. Somente depois dessa verificacao gere a previa de sincronizacao.

## Importacao por Excel

A tela `Automacoes` tambem aceita um `.xlsx` exportado do Google Sheets. O arquivo passa pelas mesmas regras de cabecalho, conciliacao, deduplicacao e confirmacao da leitura direta. O limite e 10 MB, e arquivos com macros ou extensoes diferentes de `.xlsx` sao rejeitados.

O arquivo nao e um banco paralelo. Ele serve como uma fotografia para homologacao e migracao controlada. Depois que o lote e aplicado, consultas, dashboard e relatorios usam o PostgreSQL.

## Regras de conciliacao

- CNPJ valido tem prioridade para localizar fornecedor; razao social e nome comercial sao alternativas.
- Centros de custo inexistentes sao criados antes dos fornecedores.
- Precos usam o ID externo do item; sem ID, usam fornecedor, descricao normalizada e unidade.
- Pedido ou nota fiscal ja existentes sao ignorados.
- Quando fornecedor e valor coincidem com uma unica compra sem NF, somente o numero da nota e completado.
- Mais de uma correspondencia por fornecedor e valor exige revisao manual.
- Metodo de pagamento pode ficar vazio.
- Data de emissao ausente em uma compra historica gera pendencia, mas nao bloqueia o registro principal.
- O centro de custo de uma compra historica pode ser herdado do cadastro do fornecedor.
- Parcelas ausentes ou com total divergente sao ignoradas sem bloquear a compra.

## Execucao segura

`Gerar previa` le a planilha, calcula as acoes e salva um hash do lote. `Aplicar sincronizacao` reivindica a previa uma unica vez. Uma nova leitura depois da aplicacao deve classificar os mesmos registros como duplicados.

Em caso de falha parcial, os identificadores externos e as restricoes unicas preservam a idempotencia. Gere uma nova previa antes de tentar novamente.
