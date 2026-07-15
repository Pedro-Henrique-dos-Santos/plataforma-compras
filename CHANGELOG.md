# Changelog

## 0.7.0 - 2026-07-14

- Adicionados endpoints separados de vida e prontidao com verificacao do PostgreSQL.
- Adicionados identificadores de requisicao e logs estruturados sem query strings.
- Endurecidos CORS, proxy confiavel, origens HTTPS e validacoes do ambiente de producao.
- Adicionada barreira de erro na interface para preservar a sessao em falhas de renderizacao.
- Criados teste de carga leve, backup PostgreSQL e verificacao estrutural de backup.
- Documentados alertas, implantacao controlada, restauracao e resposta a incidentes.
- Validado o modo demonstracao com 100 requisicoes, sem falhas e p95 abaixo do limite.

## 0.6.0 - 2026-07-14

- Criado relatorio operacional de compras com filtros por periodo, fornecedor, departamento, categoria e status.
- Adicionados agrupamentos por fornecedor, categoria, departamento e mes com valores e economias.
- Adicionada exportacao CSV compativel com Excel e protegida contra injecao de formulas.
- Implementada a mesma consulta consolidada nos repositorios de demonstracao e PostgreSQL.
- Adicionada tela de relatorios responsiva com detalhamento dos registros que compoem cada total.
- Mantido o grafico de pizza de gastos por departamento com valores exatos dos rateios.

## 0.5.0 - 2026-07-14

- Adicionados recebimento e validacao de NF-e e NFS-e em XML e PDF.
- Adicionada leitura gratuita de PDF pesquisavel e fallback OCR em portugues com Tesseract.
- Criada conferencia humana de fornecedor, centro de custo, categoria, itens e parcelas.
- Adicionada triagem conservadora para servicos pessoais ou profissionais fora de compras.
- Implementadas conciliacao por referencia, nota e fornecedor ou fornecedor e valor.
- Adicionadas criacao automatica de fornecedor e importacao idempotente da compra revisada.
- Criado armazenamento privado por empresa com hash, limite de arquivo e estados atomicos.
- Impedido o vazamento de hash, caminho privado e identificador interno da empresa pela API.
- Corrigida a acessibilidade dos seletores e a composicao responsiva do modulo documental.

## 0.4.0 - 2026-07-14

- Adicionada integracao configuravel com Google Sheets por empresa.
- Implementadas previa persistida, normalizacao de dados e conciliacao idempotente.
- Adicionado bloqueio contra aplicacao repetida da mesma sincronizacao.

## 0.3.0 - 2026-07-14

- Implementados fornecedores e centros de custo por empresa.
- Adicionada tabela de precos com multiplas linhas e importacao CSV.
- Implementados compras, itens, rateios por centro de custo e parcelas opcionais.
- Adicionados indicadores calculados a partir das compras.
- Criado grafico de pizza de gastos por departamento.

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
