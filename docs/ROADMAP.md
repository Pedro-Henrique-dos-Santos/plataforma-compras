# Roteiro de evolucao

## Fase 0: base versionada

- [Concluido] Preservar o Apps Script em `legacy/`.
- [Concluido] Criar monorepositorio, documentacao, verificacoes e GitHub privado.
- [Concluido] Entregar modo demonstracao executavel.

## Fase 1: identidade e empresas

- [Preparado] Configurar Supabase Free. O codigo e as migracoes estao prontos; falta criar e vincular a instancia remota.
- [Concluido] Implementar login, recuperacao e redefinicao de acesso.
- [Concluido] Criar organizacoes, convites, vinculos e troca de empresa ativa.
- [Concluido] Aplicar papeis e auditoria sem fluxo de aprovacao.
- [Concluido] Criar identidade E-Gestao, tres temas e barra lateral recolhivel.
- [Concluido] Bloquear acesso direto do navegador as tabelas operacionais.

## Fase 2: cadastros mestres

- [Concluido] Migrar fornecedores e centros de custo.
- [Concluido] Migrar tabela de precos e importacao em lote.
- [Em andamento] Criar conciliacao entre planilha e PostgreSQL.

## Fase 3: operacao de compras

- [Concluido] Migrar cadastro de compras, itens, rateios e parcelas.
- [Proximo] Incorporar notas fiscais e documentos no fluxo externo.
- [Concluido] Garantir idempotencia, isolamento por empresa e auditoria das gravacoes.

## Fase 4: inteligencia

- [Concluido] Migrar dashboard e indicadores para consultas do banco.
- [Em andamento] Criar filtros multiempresa e exportacoes.
- [Concluido] Consolidar economia negociada, comparativos mensais e gastos por departamento.

## Fase 5: producao

- Testes de carga, seguranca e recuperacao.
- Backups, observabilidade e alertas.
- Implantacao controlada e desligamento gradual do Apps Script.
