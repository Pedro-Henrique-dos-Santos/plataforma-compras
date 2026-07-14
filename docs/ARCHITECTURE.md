# Arquitetura

## Visao geral

```text
Navegador
  -> React/Vite (Supabase Auth)
  -> API NestJS (identidade, tenant e permissoes)
  -> PostgreSQL/Supabase (dados operacionais)
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

O modo `demo` usa um repositorio em memoria com o mesmo contrato da implementacao Prisma. Em homologacao e producao, o repositorio Prisma e selecionado automaticamente e persiste usuarios, empresas, vinculos e auditoria no PostgreSQL.

## Interface

O produto usa a marca E-Gestao Compras e exibe o nome da empresa ativa no cabecalho. A barra lateral pode ser recolhida e permanece funcional em telas menores. As preferencias visuais oferecem os temas Normal, Escuro e Branco e sao salvas apenas no navegador do usuario.

## Transicao do legado

O Apps Script atual permanece em producao. A nova API recebera adaptadores para ler a planilha durante a migracao. Cada modulo sera validado e reconciliado antes de passar a gravar exclusivamente no PostgreSQL.
