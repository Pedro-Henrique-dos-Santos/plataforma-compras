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

