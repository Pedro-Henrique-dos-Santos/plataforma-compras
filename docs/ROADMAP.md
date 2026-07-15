# Roteiro de evolucao

## Fase 0: base versionada

- [Concluido] Preservar o Apps Script em `legacy/`.
- [Concluido] Criar monorepositorio, documentacao, verificacoes e GitHub privado.
- [Concluido] Entregar modo demonstracao executavel.

## Fase 1: identidade e empresas

- [Concluido] Criar o Supabase Free de homologacao na regiao de Sao Paulo.
- [Concluido] Aplicar as migracoes, habilitar RLS, bloquear tabelas operacionais e criar o bucket privado.
- [Concluido] Implementar login, recuperacao e redefinicao de acesso.
- [Concluido] Criar organizacoes, convites, vinculos e troca de empresa ativa.
- [Concluido] Aplicar papeis e auditoria sem fluxo de aprovacao.
- [Concluido] Criar identidade E-Gestao, tres temas e barra lateral recolhivel.
- [Concluido] Bloquear acesso direto do navegador as tabelas operacionais.

## Fase 2: cadastros mestres

- [Concluido] Migrar fornecedores e centros de custo.
- [Concluido] Migrar tabela de precos e importacao em lote.
- [Concluido] Criar conciliacao entre planilha e PostgreSQL.
- [Concluido] Adicionar importacao XLSX com historico legado, previa e deduplicacao.

## Fase 3: operacao de compras

- [Concluido] Migrar cadastro de compras, itens, rateios e parcelas.
- [Concluido] Incorporar notas fiscais XML e PDF, OCR gratuito, revisao e conciliacao no fluxo externo.
- [Concluido] Garantir idempotencia, isolamento por empresa e auditoria das gravacoes.

## Fase 4: inteligencia

- [Concluido] Migrar dashboard e indicadores para consultas do banco.
- [Concluido] Criar filtros por empresa e exportacoes CSV e XLSX.
- [Concluido] Consolidar economia negociada, comparativos mensais e gastos por departamento.

## Fase 5: producao

- [Concluido no codigo] Testes de carga, seguranca e recuperacao.
- [Concluido no codigo] Backups, prontidao, observabilidade e plano de alertas.
- [Concluido no CI] Aplicar migracoes em PostgreSQL descartavel e testar isolamento multiempresa e RLS.
- [Concluido no CI] Executar backup, restauracao integral e reconciliacao em banco descartavel.
- [Concluido local] Executar aceite funcional sintetico dos cadastros, compras, rateios, documentos e dashboard.
- [Concluido] Executar migracoes e validar o Supabase de homologacao e o bucket privado.
- [Em homologacao] Criar o proprietario global independente e a empresa Human Clinic.
- [Em homologacao] Aplicar o primeiro lote real e reconciliar os totais com a planilha.
- [Em homologacao] Gerar o primeiro relatorio XLSX a partir do PostgreSQL.
- [Pendente externo] Implantacao controlada e desligamento gradual do Apps Script.
