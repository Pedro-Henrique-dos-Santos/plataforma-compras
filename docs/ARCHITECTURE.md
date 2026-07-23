# Arquitetura

## Visao geral

```text
Navegador
  -> React/Vite (Supabase Auth)
  -> API NestJS (identidade, tenant e permissoes)
  -> PostgreSQL/Supabase (dados operacionais)
  -> Google Sheets API (conciliacao durante a transicao)
  -> Google Drive para documentos durante a transicao
```

O front-end nunca recebe a chave privilegiada do banco. A API valida o token do Supabase, a identidade local, a empresa ativa, o papel e a permissao antes de executar operacoes.

Respostas da API usam `Cache-Control: no-store`, e a interface desativa o cache nas requisicoes operacionais. Isso evita reutilizar identidade, permissoes, indicadores ou dados empresariais depois de uma troca de sessao ou empresa.

O navegador nao acessa tabelas operacionais pelo cliente Supabase. O Row Level Security fica habilitado sem politicas para `anon` e `authenticated`, e os privilegios de `PUBLIC`, `anon` e `authenticated` sao revogados. Somente a API usa a conexao PostgreSQL protegida. O CI consulta o catalogo do PostgreSQL e falha se uma tabela da aplicacao for criada sem RLS.

O cadastro de identidade separa o e-mail autenticado do nome exibido na plataforma. Os Termos de uso e o Aviso de privacidade possuem versoes independentes; a API grava a versao, a data, o endereco de rede disponivel e o agente do navegador em evento de auditoria. Uma nova versao volta a bloquear o acesso ate que os dois documentos sejam aceitos novamente.

## Multiempresa

Um usuario pode participar de varias organizacoes por meio de `OrganizationMembership`. Cada requisicao autenticada possui uma empresa ativa. Todas as entidades operacionais carregam `organizationId` e sao filtradas por esse identificador.

O papel global `PLATFORM_OWNER` fica separado dos papeis da organizacao. Isso impede que um administrador de cliente promova usuarios para administrar a plataforma inteira.

Os e-mails autorizados a receber o papel global ficam em `PLATFORM_OWNER_EMAILS`, configurado somente no back-end. Contas como `compras@humanclinic.com.br` permanecem vinculadas apenas a empresa cliente.

## Papeis iniciais

| Papel | Escopo | Uso |
| --- | --- | --- |
| `PLATFORM_OWNER` | Plataforma | Cria empresas, administra acessos globais e consulta todos os ambientes |
| `ORGANIZATION_ADMIN` | Empresa | Administra usuarios e dados de uma empresa |
| `BUYER` | Empresa | Opera compras, fornecedores, precos e notas |
| `REPORT_VIEWER` | Empresa | Consulta dashboards e relatorios |

Nao existe papel de aprovador nesta fase.

## Persistencia

O schema PostgreSQL usa chaves UUID, valores monetarios em `Decimal`, datas de auditoria e relacionamentos explicitos. PDFs permanecem fora do banco; o banco armazena metadados e links controlados.

O modo `demo` usa repositorios em memoria com os mesmos contratos das implementacoes Prisma. Em homologacao e producao, os repositorios Prisma sao selecionados automaticamente e persistem usuarios, empresas, vinculos, centros de custo, fornecedores, precos, compras, itens, rateios, parcelas e auditoria no PostgreSQL.

O cadastro da organizacao mantem nome exibido, razao social, CNPJ, contato e endereco. Esses dados pertencem ao tenant e somente o proprietario global ou um administrador da propria empresa pode altera-los.

As importacoes de precos procuram primeiro o codigo do item e, na ausencia dele, usam a descricao normalizada e a unidade. Compras usam numero, origem e referencia externa para impedir repeticoes. Todas as consultas e gravacoes recebem `organizationId` no servidor.

## Sincronizacao com Google Sheets

Cada empresa possui no maximo uma configuracao ativa de Google Sheets. A credencial da conta de servico fica somente no ambiente do servidor; o banco guarda apenas o ID da planilha, os nomes das abas e o estado da ultima sincronizacao.

A conta de servico recebe somente acesso de leitura e a API solicita o escopo `spreadsheets.readonly`. Uma verificacao dedicada consulta apenas os metadados da planilha para comprovar credencial, compartilhamento e mapeamento das abas antes de qualquer previa. Essa verificacao nao cria lote nem grava dados operacionais.

A leitura usa as abas normalizadas de fornecedores, precos, itens e parcelas. Quando a aba `valores negociados` existe, o adaptador tambem incorpora o historico legado, elimina pedidos que ja aparecem nos itens normalizados e herda o centro de custo padrao do fornecedor. Registros historicos sem data permanecem visiveis como pendencia e nao recebem datas inventadas.

O mesmo fluxo aceita um arquivo `.xlsx` exportado da planilha. O upload possui limite de tamanho, valida o formato real, preserva os numeros das linhas e usa exatamente o mesmo parser, hash, previa e aplicacao da leitura pela API do Google. Isso permite homologar a migracao antes de disponibilizar uma conta de servico.

A conciliacao resolve primeiro centros de custo e fornecedores, depois precos e compras. Uma compra existente com o mesmo fornecedor e valor recebe somente a nota fiscal ausente. Ambiguidades permanecem para revisao; parcelas ausentes ou divergentes nao bloqueiam o registro principal.

Durante a transicao, o fluxo de dados e intencionalmente unidirecional: Google Sheets ou XLSX para previa, previa confirmada para PostgreSQL e PostgreSQL para relatorios. Nao existe sincronizacao automatica bidirecional, pois edicoes concorrentes criariam conflitos e dupla contagem. Depois da homologacao, o PostgreSQL passa a ser a fonte oficial.

## Operacao de compras

A consulta detalhada de uma compra devolve itens, rateios, parcelas, observacoes e a referencia fiscal dentro do tenant ativo. A correcao substitui itens e parcelas em uma unica transacao, recalcula total e economia e preserva a origem e a referencia externa da importacao. Fornecedores ou centros de custo historicos que tenham sido inativados podem permanecer no registro existente, mas nao podem ser escolhidos para uma nova classificacao.

Toda edicao exige o `updatedAt` lido pelo usuario. Se outra operacao alterar a compra antes da gravacao, a API rejeita a versao antiga e exige recarregamento. Parcelas pagas permanecem no banco e nao podem ter valor, vencimento, ordem ou existencia alterados pela edicao da compra.

Cancelamento e reativacao exigem motivo, atualizam o estado sem apagar o historico e geram evento de auditoria. Compras canceladas permanecem consultaveis por filtro e nos relatorios de cancelamento, mas nao entram nos indicadores de compras registradas. Nao existe alcada de aprovacao neste ciclo.

## Indicadores

O dashboard nao armazena totais derivados. Por padrao, a API agrega todo o historico de compras registradas e aceita filtros de periodo, fornecedor, centro de custo, categoria e inclusao de registros sem data. Quando um item possui rateio, somente os valores das alocacoes entram no grafico por departamento; o total direto do item nao e somado novamente. Compras sem data entram nos totais, categorias e departamentos, mas ficam fora da serie mensal ate a correcao da emissao.

## Relatorios

Os relatorios usam as compras como fonte unica e aplicam o `organizationId` antes de qualquer filtro. A API consolida valores, economia, ticket medio e contagens e devolve agrupamentos por fornecedor, categoria, departamento e mes. Os valores departamentais usam os montantes exatos dos rateios e mantem itens sem classificacao visiveis.

As exportacoes CSV e XLSX repetem os filtros da consulta e neutralizam celulas iniciadas por caracteres de formula. O CSV usa separador compativel com Excel em `pt_BR`. O Excel resumido entrega indicadores, compras e agrupamentos por departamento, fornecedor, categoria e mes. O Excel detalhado acrescenta itens, consolidacao mensal de itens, rateios, parcelas, notas fiscais e dados cadastrais dos fornecedores. Datas, quantidades e valores monetarios permanecem tipados; nenhuma agregacao e calculada no navegador.

## Interface

O produto usa a marca E-Gestao Compras e exibe o nome da empresa ativa no cabecalho. A barra lateral pode ser recolhida e permanece funcional em telas menores. As preferencias visuais oferecem os temas Normal, Escuro e Branco e sao salvas apenas no navegador do usuario.

## Operacao e recuperacao

A API separa verificacoes de vida e prontidao. Fora do modo demonstrativo, a prontidao executa uma consulta minima no PostgreSQL. Toda resposta recebe `x-request-id`, e o log estruturado registra metodo, caminho sem parametros, status e duracao.

Backups usam o formato customizado do `pg_dump` sem expor a senha na linha de comando. A verificacao estrutural usa `pg_restore --list`; o CI restaura o arquivo em outro banco descartavel e compara migracoes, contagens, totais monetarios e RLS antes de apagar o ambiente de ensaio.

## Transicao do legado

O Apps Script atual permanece em producao. O adaptador de leitura da planilha ja esta disponivel com previa e conciliacao; a mudanca de fonte primaria para PostgreSQL sera feita somente apos homologacao e comparacao dos totais.
