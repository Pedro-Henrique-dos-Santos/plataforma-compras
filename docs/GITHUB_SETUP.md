# Publicacao no GitHub

## Repositorio recomendado

- Nome: `plataforma-compras`
- Visibilidade: privada
- Branch principal: `main`

## Pre-requisitos locais

1. Instalar o GitHub CLI (`gh`).
2. Executar `gh auth login` e concluir o acesso na conta proprietaria.
3. Configurar nome e e-mail do autor do Git.

## Primeira publicacao

```bash
git add -A
git commit -m "inicia plataforma multiempresa de compras"
gh repo create plataforma-compras --private --source . --remote origin --push
```

Antes do primeiro commit, confirme que `git status` nao mostra `.env.local`. O arquivo ja esta coberto pelo `.gitignore`.

## Protecoes apos a publicacao

- Exigir pull request na branch `main`.
- Exigir o workflow `CI` antes de mesclar.
- Bloquear force push e exclusao da branch principal.
- Habilitar alertas do Dependabot e verificacao de segredos disponivel para a conta.

## Ambientes e imagens

Crie os ambientes protegidos `staging` e `production`. O ambiente de producao deve exigir revisao manual e usar credenciais diferentes da homologacao.

Cadastre como variaveis do repositorio, pois sao incorporadas ao frontend e nao sao segredos:

- `PRODUCTION_API_URL`
- `PRODUCTION_SUPABASE_URL`
- `PRODUCTION_SUPABASE_PUBLISHABLE_KEY`

Cadastre no ambiente `production`:

- `PRODUCTION_DATABASE_URL`
- `PRODUCTION_SUPABASE_URL`
- `PRODUCTION_SUPABASE_SECRET_KEY` ou a chave legada `PRODUCTION_SUPABASE_SERVICE_ROLE_KEY`

O workflow `Publish Container Images` e acionado somente por tags `vX.Y.Z`. A tag precisa corresponder as versoes de todos os pacotes e a uma secao datada do `CHANGELOG.md`. O workflow publica imagens privadas da API e da web no GitHub Container Registry.

Proteja tambem o padrao de tags `v*` com uma ruleset: restrinja criacao e exclusao aos mantenedores, bloqueie atualizacao da mesma tag e exija que o commit pertenca a `main`. Os workflows recusam tags cujo commit nao esteja no historico da branch principal.
