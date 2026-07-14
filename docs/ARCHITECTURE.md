# Arquitetura

## Visao geral

```text
Navegador
  -> React/Vite
  -> API NestJS
  -> PostgreSQL/Supabase
  -> Google Drive para documentos durante a transicao
```

O front-end nunca recebe a chave privilegiada do banco. A API valida identidade, empresa ativa, papel e permissao antes de executar operacoes.

## Multiempresa

Um usuario pode participar de varias organizacoes por meio de `OrganizationMembership`. Cada requisicao autenticada possui uma empresa ativa. Todas as entidades operacionais carregam `organizationId` e sao filtradas por esse identificador.

O papel global `PLATFORM_OWNER` fica separado dos papeis da organizacao. Isso impede que um administrador de cliente promova usuarios para administrar a plataforma inteira.

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

## Transicao do legado

O Apps Script atual permanece em producao. A nova API recebera adaptadores para ler a planilha durante a migracao. Cada modulo sera validado e reconciliado antes de passar a gravar exclusivamente no PostgreSQL.

