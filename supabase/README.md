# Configuracao do Supabase

1. Crie um projeto no plano Free.
2. Copie a URL publica e a chave anonima para os arquivos `.env` locais.
3. Copie a URL de conexao PostgreSQL para `DATABASE_URL` somente no back-end.
4. Nunca coloque `SUPABASE_SERVICE_ROLE_KEY` no front-end.
5. Execute `pnpm db:migrate` quando o ambiente estiver conectado.
6. Cadastre o primeiro proprietario global por um processo de bootstrap controlado.

O modo de demonstracao funciona sem essas credenciais. Ele deve permanecer desativado em producao.

