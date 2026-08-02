# ADR 0006: runtime local persistente por padrao

## Status

Aceito em 2026-08-01.

## Contexto

O modo demonstracao facilitou o inicio do front-end sem infraestrutura, mas
permitia abrir clones locais com dados em memoria e transmitir a impressao de
que cadastros seriam preservados. Bases locais independentes em casa e na
empresa tambem nao atendem a necessidade de uma operacao unica.

## Decisao

- `pnpm dev` inicia web e API com persistencia PostgreSQL/Supabase.
- Configuracao persistente ausente interrompe a inicializacao; nao existe recuo
  automatico para repositorios em memoria.
- `pnpm dev:demo` e a opcao explicita para dados descartaveis.
- `.env.local` na raiz e o arquivo canonico e permanece ignorado pelo Git.
- Casa e empresa usam o mesmo projeto hospedado e o mesmo modelo multiempresa.
- `local:setup` aplica migracoes, verifica RLS e prepara o storage privado antes
  do uso de uma versao nova.

## Consequencias

Um clone novo precisa de credenciais validas antes de iniciar. Segredos devem
ser distribuidos fora do GitHub. A indisponibilidade do projeto hospedado impede
novas operacoes ate a recuperacao, mas evita bases divergentes. O modo local do
Supabase continua adequado a desenvolvimento isolado, sem sincronizacao entre
maquinas.
