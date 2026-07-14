# Changelog

## 0.2.0 - 2026-07-14

- Adicionada a identidade visual E-Gestao Compras.
- Adicionados os temas Normal, Escuro e Branco com preferencia local persistente.
- Adicionada barra lateral recolhivel e navegacao responsiva.
- Implementados login Supabase, recuperacao de senha e redefinicao de senha.
- Implementados cadastro de empresas, convites, papeis e suspensao de membros.
- Separado o proprietario global dos administradores de empresas clientes.
- Adicionadas validacoes de CNPJ, ambiente, origem, empresa ativa e permissao.
- Adicionadas persistencias intercambiaveis para demonstracao e PostgreSQL.
- Adicionada protecao de acesso direto as tabelas publicas do Supabase.
- Corrigida uma vulnerabilidade transitiva identificada na auditoria de dependencias.
- Ampliados os testes de contratos, API, interface e configuracao.

## 0.1.0 - 2026-07-13

- Criada a base React, TypeScript e Vite.
- Criada a API NestJS com autenticacao Supabase e limite de requisicoes.
- Adicionado modelo multiempresa com papeis globais e empresariais separados.
- Adicionado schema PostgreSQL, migracao inicial e seed de desenvolvimento.
- Criado dashboard com indicadores, grafico mensal e distribuicao por categoria.
- Criadas telas de empresas e acessos.
- Preservado o sistema Google Apps Script em `legacy/`.
- Adicionados testes, build, CI, Dependabot e documentacao arquitetural.
