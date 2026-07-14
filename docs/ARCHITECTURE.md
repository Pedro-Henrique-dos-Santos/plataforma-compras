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

O navegador nao acessa tabelas operacionais pelo cliente Supabase. O Row Level Security fica habilitado sem politicas para `anon` e `authenticated`, e os privilegios diretos desses papeis sao revogados. Somente a API usa a conexao PostgreSQL protegida.

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

As importacoes de precos procuram primeiro o codigo do item e, na ausencia dele, usam a descricao normalizada e a unidade. Compras usam numero, origem e referencia externa para impedir repeticoes. Todas as consultas e gravacoes recebem `organizationId` no servidor.

## Sincronizacao com Google Sheets

Cada empresa possui no maximo uma configuracao ativa de Google Sheets. A credencial da conta de servico fica somente no ambiente do servidor; o banco guarda apenas o ID da planilha, os nomes das abas e o estado da ultima sincronizacao.

A leitura usa as abas normalizadas de fornecedores, precos, itens e parcelas. O servidor converte formatos `pt_BR`, valida cabecalhos e cria uma previa imutavel com hash do conteudo. A aplicacao reivindica essa previa de forma atomica para impedir execucao dupla.

A conciliacao resolve primeiro centros de custo e fornecedores, depois precos e compras. Uma compra existente com o mesmo fornecedor e valor recebe somente a nota fiscal ausente. Ambiguidades permanecem para revisao; parcelas ausentes ou divergentes nao bloqueiam o registro principal.

## Indicadores

O dashboard nao armazena totais derivados. A API agrega compras registradas por mes, categoria e departamento. Quando um item possui rateio, somente os valores das alocacoes entram no grafico por departamento; o total direto do item nao e somado novamente.

## Interface

O produto usa a marca E-Gestao Compras e exibe o nome da empresa ativa no cabecalho. A barra lateral pode ser recolhida e permanece funcional em telas menores. As preferencias visuais oferecem os temas Normal, Escuro e Branco e sao salvas apenas no navegador do usuario.

## Transicao do legado

O Apps Script atual permanece em producao. O adaptador de leitura da planilha ja esta disponivel com previa e conciliacao; a mudanca de fonte primaria para PostgreSQL sera feita somente apos homologacao e comparacao dos totais.
