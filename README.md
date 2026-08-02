# E-Gestao Compras

Aplicacao multiempresa para controle de compras, fornecedores, precos negociados, notas fiscais e indicadores. O repositorio conduz a migracao progressiva do portal Google Apps Script para React, TypeScript, NestJS e PostgreSQL.

## Estado atual

- O portal de producao em Apps Script continua preservado em `legacy/apps-script`.
- A nova aplicacao nao substitui a versao em producao automaticamente.
- A execucao local padrao usa PostgreSQL/Supabase e preserva os dados; o modo
  demonstracao precisa ser iniciado explicitamente.
- O Supabase Free de homologacao esta criado, migrado, protegido por RLS e com armazenamento privado.
- A identidade possui nome exibido editavel, criacao de conta e aceite versionado dos documentos legais.
- Empresas, convites e papeis possuem API e persistencia; administradores podem manter CNPJ, contato e endereco da empresa.
- A interface inclui os temas Normal, Escuro e Branco e uma barra lateral recolhivel.
- Centros de custo e fornecedores possuem cadastro por empresa, status e regras padrao.
- A tabela de precos aceita varias linhas e importacao CSV idempotente por fornecedor.
- Compras suportam varios itens, economia negociada, centro automatico, rateios e parcelas opcionais.
- O Kanban acompanha cadastro, solicitacao, aprovacao, pedido, faturamento,
  recebimento e conclusao, com historico por compra.
- Regras por valor selecionam aprovadores da empresa e aceitam quorum de uma ou
  duas pessoas, com notificacoes duraveis por e-mail ou WhatsApp oficial.
- O financeiro recebe os dados aprovados e acompanha contas nao programadas,
  abertas, vencidas e pagas, com previsoes e exportacao Excel.
- O dashboard abre em todo o historico, filtra periodo, fornecedor, centro de custo e categoria e inclui gastos por categoria e departamento.
- Os relatorios filtram compras por periodo, fornecedor, departamento, categoria e status, com CSV, Excel resumido e Excel detalhado com itens por mes.
- As compras possuem detalhe, correcao transacional, cancelamento e reativacao auditados; parcelas pagas permanecem protegidas.
- A sincronizacao com Google Sheets possui configuracao por empresa, importacao XLSX, leitura do historico legado, previa persistida, conciliacao e aplicacao idempotente; compras sem data permanecem visiveis como pendencia.
- Notas em XML ou PDF passam por validacao, leitura estruturada ou OCR gratuito, revisao humana e conciliacao antes de criar compras.
- A API possui prontidao do banco, identificadores de requisicao e logs estruturados.
- O repositorio inclui teste de carga leve, backup com restauracao integral e integracao multiempresa contra PostgreSQL real no CI.
- Web e API possuem imagens de producao separadas, executadas sem privilegios e validadas por smoke tests no GitHub Actions.
- Tags de versao podem publicar imagens com SBOM e proveniencia no GitHub Container Registry.

## Estrutura

```text
apps/web             React + TypeScript + Vite
apps/api             NestJS + TypeScript
packages/contracts   contratos, papeis e permissoes compartilhados
packages/database    schema PostgreSQL e migracoes Prisma
legacy               codigo e testes do Apps Script atual
docs                 arquitetura, contexto, decisoes e roteiro
```

## Requisitos

- Node.js 22 ou superior
- pnpm 11
- PostgreSQL local opcional, ou projeto Supabase

## Primeira execucao

```powershell
Copy-Item .env.example .env.local
# Preencha .env.local com as credenciais do ambiente compartilhado.
pnpm install
pnpm local:check
pnpm local:setup
pnpm dev
```

O portal abre em `http://127.0.0.1:5173` e a API em
`http://127.0.0.1:3333/api`. O comando `pnpm dev` exige configuracao persistente
e nunca troca silenciosamente para dados em memoria. Para um ambiente
descartavel, use conscientemente `pnpm dev:demo`.

Casa e empresa devem usar o mesmo projeto Supabase para enxergar os mesmos
registros. Cada computador executa web e API localmente, mas os dados ficam no
PostgreSQL central. Duas bases PostgreSQL locais sao independentes e nao se
sincronizam automaticamente.

O arquivo `.env.local` e ignorado pelo Git e nunca deve ser enviado ao
repositorio. Consulte [Execucao local persistente](docs/LOCAL_PERSISTENCE.md) e
[Configuracao do Supabase](supabase/README.md). O modo de producao nao inicia sem
as variaveis obrigatorias e sem a lista independente de proprietarios globais.

## Qualidade

```bash
pnpm check
```

Esse comando executa lint, verificacao de tipos, testes e build de todos os pacotes.

Na versao `0.11.0`, a verificacao inclui contratos compartilhados, isolamento multiempresa,
importacoes idempotentes, rateios, agregacoes do dashboard, conciliacao com Google Sheets,
automacao documental com revisao obrigatoria, Kanban, aprovacao por valor, notificacoes,
contas a pagar, relatorios filtrados, exportacao segura em CSV e XLSX, edicao concorrente e
ciclo auditado das compras, alem da prontidao operacional. O CI aplica todas as migracoes em
um PostgreSQL descartavel e executa testes de isolamento dos repositorios, das protecoes RLS
e de recuperacao completa do banco.
Um workflow manual protegido prepara e valida o Supabase de homologacao sem armazenar segredos no codigo.

O roteiro reproduzivel de validacao esta em `docs/ACCEPTANCE_TESTS.md`.

## Seguranca

Nunca envie `.env`, chaves do Supabase, tokens do Google ou chaves da OpenAI ao GitHub. Consulte [SECURITY.md](SECURITY.md) antes de configurar ambientes compartilhados.

## Planejamento

- [Arquitetura](docs/ARCHITECTURE.md)
- [Auditoria de conclusao](docs/COMPLETION_AUDIT.md)
- [Roteiro de evolucao](docs/ROADMAP.md)
- [Contexto e decisoes confirmadas](docs/PROJECT_CONTEXT.md)
- [Integracao com Google Sheets](docs/GOOGLE_SHEETS_INTEGRATION.md)
- [Automacao de documentos fiscais](docs/INVOICE_AUTOMATION.md)
- [Compras, aprovacoes e contas a pagar](docs/PURCHASE_APPROVALS.md)
- [Relatorios operacionais](docs/REPORTS.md)
- [Prontidao para producao](docs/PRODUCTION_READINESS.md)
- [Execucao local persistente](docs/LOCAL_PERSISTENCE.md)
- [Recuperacao e backups](docs/RECOVERY_RUNBOOK.md)
- [Implantacao e imagens](docs/DEPLOYMENT.md)
