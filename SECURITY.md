# Politica de seguranca

## Credenciais

- Segredos devem existir apenas em variaveis de ambiente ou no gerenciador de segredos da hospedagem.
- Chaves `service_role` nunca podem ser expostas ao navegador.
- O repositorio aceita somente `.env.example` sem valores reais.
- O proprietario global nao deve usar uma conta pertencente a uma empresa cliente.

## Isolamento multiempresa

- Toda entidade operacional deve conter `organizationId`.
- Toda leitura ou escrita deve validar a empresa ativa e o vinculo do usuario.
- Administradores de empresa nao podem conceder papeis da plataforma.
- Acoes administrativas e alteracoes financeiras devem gerar auditoria.

## Relato de vulnerabilidade

Nao abra uma issue publica contendo credenciais ou dados empresariais. Registre o problema em canal privado com o proprietario da plataforma.

