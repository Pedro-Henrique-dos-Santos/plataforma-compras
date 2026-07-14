# E-Gestao Compras

Aplicacao multiempresa para controle de compras, fornecedores, precos negociados, notas fiscais e indicadores. O repositorio conduz a migracao progressiva do portal Google Apps Script para React, TypeScript, NestJS e PostgreSQL.

## Estado atual

- O portal de producao em Apps Script continua preservado em `legacy/apps-script`.
- A nova aplicacao nao substitui a versao em producao automaticamente.
- O modo demonstracao permite desenvolver sem credenciais do Supabase.
- O banco definitivo sera PostgreSQL, com Supabase Free no desenvolvimento remoto.
- A identidade, as empresas, os convites e os papeis ja possuem implementacao de API e persistencia.
- A interface inclui os temas Normal, Escuro e Branco e uma barra lateral recolhivel.
- Centros de custo e fornecedores possuem cadastro por empresa, status e regras padrao.
- A tabela de precos aceita varias linhas e importacao CSV idempotente por fornecedor.
- Compras suportam varios itens, economia negociada, centro automatico, rateios e parcelas opcionais.
- O dashboard e calculado a partir das compras e inclui gastos por categoria e departamento.

## Estrutura

```text
apps/web             React + TypeScript + Vite
apps/api             NestJS + TypeScript
packages/contracts   contratos, papeis e permissoes compartilhados
packages/database    schema PostgreSQL e migracoes Prisma
legacy               codigo e testes do Apps Script atual
docs                 arquitetura, contexto, decisoes e roteiro
```

## Requisitos

- Node.js 22 ou superior
- pnpm 10
- PostgreSQL local opcional, ou projeto Supabase

## Primeira execucao

```bash
pnpm install
pnpm db:generate
pnpm dev
```

O portal abre em `http://localhost:5173` e a API em `http://localhost:3333/api`. Sem credenciais, mantenha `VITE_DEMO_MODE=true` e `DEMO_MODE=true` em um arquivo `.env` local.

Para conectar um projeto Supabase real, siga [supabase/README.md](supabase/README.md). O modo de producao nao inicia sem as variaveis obrigatorias e sem a lista independente de proprietarios globais.

## Qualidade

```bash
pnpm check
```

Esse comando executa lint, verificacao de tipos, testes e build de todos os pacotes.

Na versao `0.3.0`, a verificacao inclui contratos compartilhados, isolamento multiempresa,
importacoes idempotentes, rateios e agregacoes do dashboard.

## Seguranca

Nunca envie `.env`, chaves do Supabase, tokens do Google ou chaves da OpenAI ao GitHub. Consulte [SECURITY.md](SECURITY.md) antes de configurar ambientes compartilhados.

## Planejamento

- [Arquitetura](docs/ARCHITECTURE.md)
- [Roteiro de evolucao](docs/ROADMAP.md)
- [Contexto e decisoes confirmadas](docs/PROJECT_CONTEXT.md)
