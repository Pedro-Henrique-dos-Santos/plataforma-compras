# Configuracao do Supabase

## 1. Criar o projeto

Crie um projeto no plano Free e guarde a senha do banco em um gerenciador de segredos. Use uma regiao proxima aos usuarios e nao reutilize credenciais de outros clientes.

## 2. Configurar o ambiente local

Crie o arquivo privado `.env.local` na raiz a partir de `.env.example`. Esse e o
arquivo canonico lido pela API e pelo front-end:

- `DEMO_MODE=false`
- `APP_WEB_URL` com a origem exata do front-end
- `DATABASE_URL` com a conexao PostgreSQL do projeto
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `PLATFORM_OWNER_EMAILS` com a conta independente do proprietario da plataforma
- `REQUIRE_VERIFIED_EMAIL=true`
- `CORS_ORIGIN` com as origens HTTPS autorizadas
- `TRUST_PROXY=true` somente quando houver um proxy confiavel na frente da API
- `INVOICE_STORAGE_BUCKET` com o nome do bucket privado de documentos
- `VITE_DEMO_MODE=false`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_API_URL=/api`

`SUPABASE_SECRET_KEY` e `DATABASE_URL` existem somente no back-end. As variaveis legadas `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` continuam aceitas apenas para compatibilidade.

Os arquivos antigos `apps/api/.env`, `apps/web/.env` e `.env.staging.local`
continuam aceitos como fallback local, mas um clone novo deve usar
`.env.local`. Nenhum desses arquivos pode ser versionado.

Valide o destino antes de iniciar:

```bash
pnpm local:check
```

A chave anonima e publica por definicao, mas nao concede acesso as tabelas operacionais deste projeto.

## 3. Aplicar e validar o banco

```bash
pnpm local:setup
```

O comando gera o cliente Prisma, aplica somente migracoes pendentes, verifica
RLS e relacionamentos multiempresa e garante o bucket privado. Depois use
`pnpm dev`. O modo em memoria existe apenas em `pnpm dev:demo`.

As migracoes criam o schema e habilitam Row Level Security sem politicas de acesso direto para `anon` e `authenticated`. A aplicacao acessa os dados somente pela API.

`pnpm db:migrate` usa o fluxo interativo de desenvolvimento e nao deve ser executado na implantacao.

Crie o bucket definido em `INVOICE_STORAGE_BUCKET` como privado. A chave privilegiada fica somente na API; o navegador nao recebe caminho interno, hash ou acesso direto aos documentos.

## 4. Configurar autenticacao

No painel do Supabase, defina a URL do front-end e as URLs de redirecionamento permitidas para login, convite e recuperacao de senha. Mantenha a confirmacao de e-mail ativa.

## 5. Validar antes de compartilhar

1. Entre com a conta indicada em `PLATFORM_OWNER_EMAILS`.
2. Crie duas empresas de teste.
3. Convide um administrador para somente uma delas.
4. Confirme que ele nao enxerga a outra empresa nem a tela global de empresas.
5. Suspenda o usuario e confirme a revogacao no acesso seguinte.
6. Envie um XML e um PDF de teste, revise os campos e confirme a conciliacao sem duplicidade.
7. Compare dashboard, relatorio e exportacao com os mesmos totais da planilha.
8. Execute um backup e uma restauracao de ensaio conforme `docs/RECOVERY_RUNBOOK.md`.

Confirme tambem que `GET http://127.0.0.1:3333/api/health/ready` responde com
`persistence` igual a `database`. O modo demonstracao funciona sem credenciais,
mas deve ser iniciado apenas de forma explicita e nunca representa a operacao
real.

## 6. Homologacao automatizada pelo GitHub

Crie um ambiente protegido chamado `staging` no repositorio e cadastre somente nele:

- `STAGING_DATABASE_URL`: conexao PostgreSQL com permissao para migracoes.
- `STAGING_SUPABASE_URL`: URL HTTPS do projeto.
- `STAGING_SUPABASE_SECRET_KEY`: chave privilegiada usada apenas pelo job protegido.

Execute manualmente o workflow `Supabase Staging` e informe `APLICAR HOMOLOGACAO`. O job aplica migracoes com `prisma migrate deploy`, executa os testes de isolamento multiempresa e garante que o bucket `invoice-documents` exista como privado.

O workflow nao cria usuarios, empresas permanentes nem dados demonstrativos. Os registros sinteticos dos testes usam identificadores aleatorios e sao removidos ao final. Nunca use credenciais de producao no ambiente `staging`.
