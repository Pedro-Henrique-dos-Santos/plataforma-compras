# Changelog

## 0.8.1 - 2026-07-16

- Concluido o aceite visual autenticado em desktop de 1280 por 720 pixels e dispositivo movel de 390 por 844 pixels.
- Adicionada fixture descartavel e protegida para provisionar e remover a identidade, empresa e dados sinteticos usados no aceite visual.
- Corrigida a limpeza da fixture para remover rateios e compras antes das relacoes restritivas de centros de custo e fornecedores.
- Corrigido o layout dos filtros do dashboard em 1280 pixels, eliminando corte de acoes e rolagem horizontal da pagina.
- Liberado o cadastro da empresa para administradores da organizacao, sem permitir que criem empresas ou concedam o papel global `PLATFORM_OWNER`.
- Corrigido o indicador da origem dos relatorios durante carregamento ou falha, evitando identificar dados reais como demonstrativos.
- Adicionados testes da navegacao por papel, da origem do relatorio e das protecoes da fixture de homologacao.

## 0.8.0 - 2026-07-14

- Criado e protegido o projeto Supabase Free de homologacao na regiao de Sao Paulo.
- Aplicadas e validadas todas as migracoes, o isolamento multiempresa e o bucket privado de documentos.
- Adicionado suporte as chaves atuais publishable e secret do Supabase com compatibilidade para as chaves legadas.
- Adicionada importacao segura de arquivos XLSX pelo mesmo fluxo de previa e aplicacao do Google Sheets.
- Incorporada a aba historica `valores negociados` sem duplicar pedidos ja normalizados.
- Mantidas compras sem data em revisao, sem preencher informacoes fiscais por suposicao.
- Adicionada exportacao gerencial XLSX com resumo, compras, departamentos, fornecedores, categorias e meses.
- Corrigida a interoperabilidade do ExcelJS com o runtime Node usado em producao.

## 0.7.4 - 2026-07-14

- Diferenciadas as tentativas de importar uma nota ainda nao revisada, em processamento ou ja importada.
- Mantido o bloqueio atomico que impede a criacao duplicada de compras por repeticao da importacao fiscal.
- Adicionadas verificacoes que comprovam as mensagens de conflito e a estabilidade da quantidade de compras.
- Adicionado roteiro de aceite operacional para os fluxos centrais e os criterios de liberacao.
- Validado em navegador o fluxo sintetico de XML, conferencia, fornecedor automatico, centro de custo e compra.

## 0.7.3 - 2026-07-14

- Adicionado workflow manual e protegido para homologacao do banco Supabase.
- Adicionada confirmacao explicita antes de aplicar migracoes no ambiente remoto.
- Adicionada validacao multiempresa contra o banco de homologacao com limpeza dos dados sinteticos.
- Adicionado provisionamento idempotente do bucket privado de notas fiscais.
- Adicionadas validacoes de URL, chave de servico, nome do bucket e privacidade final.
- Adicionados quatro testes do provisionamento do Supabase Storage.

## 0.7.2 - 2026-07-14

- Adicionado ensaio automatizado de backup e restauracao em banco PostgreSQL descartavel.
- Adicionada reconciliacao de migracoes, RLS, contagens e totais monetarios entre origem e restauracao.
- Adicionadas protecoes contra restauracao no banco de origem, bancos reservados e hosts remotos sem confirmacao.
- Adicionados seis testes das validacoes de seguranca e integridade do ensaio.
- Substituido o seed por dados totalmente sinteticos de empresa, fornecedor, preco, compra, rateio e sincronizacao.
- Integrado o ensaio completo ao GitHub Actions.

## 0.7.1 - 2026-07-14

- Protegidas com RLS as tabelas de integracao e execucao do Google Sheets.
- Adicionado PostgreSQL descartavel ao CI com aplicacao integral das migracoes.
- Adicionados testes de integracao para isolamento de fornecedores, compras, centros de custo, indicadores e auditoria.
- Adicionada verificacao de catalogo que impede novas tabelas da aplicacao sem RLS.
- Habilitada a validacao automatica para branches de desenvolvimento `agent/**`.

## 0.7.0 - 2026-07-14

- Adicionados endpoints separados de vida e prontidao com verificacao do PostgreSQL.
- Adicionados identificadores de requisicao e logs estruturados sem query strings.
- Endurecidos CORS, proxy confiavel, origens HTTPS e validacoes do ambiente de producao.
- Adicionada barreira de erro na interface para preservar a sessao em falhas de renderizacao.
- Criados teste de carga leve, backup PostgreSQL e verificacao estrutural de backup.
- Separado o comando seguro de implantacao das migracoes do fluxo de desenvolvimento.
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
