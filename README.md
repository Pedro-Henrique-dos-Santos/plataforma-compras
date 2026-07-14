# Plataforma de Compras

Aplicacao multiempresa para controle de compras, fornecedores, precos negociados, notas fiscais e indicadores. Este repositorio inicia a migracao progressiva do portal Google Apps Script para React, TypeScript, NestJS e PostgreSQL.

## Estado atual

- O portal de producao em Apps Script continua preservado em `legacy/apps-script`.
- A nova aplicacao nao substitui a versao em producao automaticamente.
- O modo demonstracao permite desenvolver sem credenciais do Supabase.
- O banco definitivo sera PostgreSQL, com Supabase Free no desenvolvimento remoto.

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

## Qualidade

```bash
pnpm check
```

Esse comando executa lint, verificacao de tipos, testes e build de todos os pacotes.

## Seguranca

Nunca envie `.env`, chaves do Supabase, tokens do Google ou chaves da OpenAI ao GitHub. Consulte [SECURITY.md](SECURITY.md) antes de configurar ambientes compartilhados.

