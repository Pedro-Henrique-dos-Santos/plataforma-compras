# Configuracao do Supabase

## 1. Criar o projeto

Crie um projeto no plano Free e guarde a senha do banco em um gerenciador de segredos. Use uma regiao proxima aos usuarios e nao reutilize credenciais de outros clientes.

## 2. Configurar a API

Preencha `apps/api/.env` a partir de `apps/api/.env.example`:

- `DEMO_MODE=false`
- `APP_WEB_URL` com a origem exata do front-end
- `DATABASE_URL` com a conexao PostgreSQL do projeto
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PLATFORM_OWNER_EMAILS` com a conta independente do proprietario da plataforma
- `REQUIRE_VERIFIED_EMAIL=true`

`SUPABASE_SERVICE_ROLE_KEY` e `DATABASE_URL` existem somente no back-end.

## 3. Configurar o front-end

Preencha `apps/web/.env` a partir de `apps/web/.env.example`:

- `VITE_DEMO_MODE=false`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_URL=/api` quando o front-end usar o proxy local

A chave anonima e publica por definicao, mas nao concede acesso as tabelas operacionais deste projeto.

## 4. Aplicar e validar o banco

```bash
pnpm db:generate
pnpm db:validate
pnpm db:migrate
```

As migracoes criam o schema e habilitam Row Level Security sem politicas de acesso direto para `anon` e `authenticated`. A aplicacao acessa os dados somente pela API.

## 5. Configurar autenticacao

No painel do Supabase, defina a URL do front-end e as URLs de redirecionamento permitidas para login, convite e recuperacao de senha. Mantenha a confirmacao de e-mail ativa.

## 6. Validar antes de compartilhar

1. Entre com a conta indicada em `PLATFORM_OWNER_EMAILS`.
2. Crie duas empresas de teste.
3. Convide um administrador para somente uma delas.
4. Confirme que ele nao enxerga a outra empresa nem a tela global de empresas.
5. Suspenda o usuario e confirme a revogacao no acesso seguinte.

O modo demonstracao funciona sem credenciais, mas deve permanecer desativado fora do desenvolvimento local.
