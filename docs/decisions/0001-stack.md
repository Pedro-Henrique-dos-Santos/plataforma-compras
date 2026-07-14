# ADR 0001: stack principal

## Status

Aceita.

## Decisao

Usar React com TypeScript e Vite no front-end, NestJS com TypeScript na API, PostgreSQL como banco relacional e Prisma para schema e migracoes.

## Consequencias

- Tipos e contratos podem ser compartilhados.
- O back-end possui modulos claros para autenticacao, empresas e dominio de compras.
- O banco pode sair do Supabase e ir para outro PostgreSQL sem reescrever o dominio.
- A implantacao exige dois processos: aplicacao web e API.

