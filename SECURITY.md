# Politica de seguranca

## Credenciais

- Segredos devem existir apenas em variaveis de ambiente ou no gerenciador de segredos da hospedagem.
- Chaves `service_role` nunca podem ser expostas ao navegador.
- O repositorio aceita somente `.env.example` sem valores reais.
- O proprietario global nao deve usar uma conta pertencente a uma empresa cliente.
- `PLATFORM_OWNER_EMAILS` deve conter apenas identidades independentes e controladas pelo proprietario da plataforma.
- A API exige e-mail verificado em ambientes compartilhados.

## Isolamento multiempresa

- Toda entidade operacional deve conter `organizationId`.
- Toda leitura ou escrita deve validar a empresa ativa e o vinculo do usuario.
- Administradores de empresa nao podem conceder papeis da plataforma.
- Acoes administrativas e alteracoes financeiras devem gerar auditoria.
- O navegador nao possui privilegios diretos nas tabelas operacionais do Supabase.
- Toda rota com escopo empresarial confere o parametro da rota contra `x-organization-id`.

## Entrada em producao

- Desative `DEMO_MODE` e `VITE_DEMO_MODE`.
- Defina origens CORS explicitas em `APP_WEB_URL`.
- Use uma senha de banco exclusiva e rotacione qualquer segredo compartilhado indevidamente.
- Aplique as migracoes antes de liberar o primeiro acesso.
- Teste convite, recuperacao de senha, isolamento entre duas empresas e revogacao de usuario.
- Configure `TRUST_PROXY=true` somente quando a API estiver atras de um proxy confiavel.
- Monitore respostas `5xx` e preserve o `x-request-id` ao investigar incidentes.
- Execute backup e restauracao de ensaio antes da primeira migracao de dados reais.

## Relato de vulnerabilidade

Nao abra uma issue publica contendo credenciais ou dados empresariais. Registre o problema em canal privado com o proprietario da plataforma.
