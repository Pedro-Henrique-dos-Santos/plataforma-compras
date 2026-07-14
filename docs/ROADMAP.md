# Roteiro de evolucao

## Fase 0: base versionada

- Preservar o Apps Script em `legacy/`.
- Criar monorepositorio, documentacao, verificacoes e GitHub privado.
- Entregar modo demonstracao executavel.

## Fase 1: identidade e empresas

- Configurar Supabase Free.
- Implementar login e recuperacao de acesso.
- Criar organizacoes, convites, vinculos e troca de empresa ativa.
- Aplicar papeis e auditoria sem fluxo de aprovacao.

## Fase 2: cadastros mestres

- Migrar fornecedores e centros de custo.
- Migrar tabela de precos e importacao em lote.
- Criar conciliacao entre planilha e PostgreSQL.

## Fase 3: operacao de compras

- Migrar cadastro de compras, itens, rateios e parcelas.
- Incorporar notas fiscais e documentos no fluxo externo.
- Garantir idempotencia e rastreabilidade.

## Fase 4: inteligencia

- Migrar dashboard e indicadores para consultas do banco.
- Criar filtros multiempresa e exportacoes.
- Consolidar economia negociada e comparativos historicos.

## Fase 5: producao

- Testes de carga, seguranca e recuperacao.
- Backups, observabilidade e alertas.
- Implantacao controlada e desligamento gradual do Apps Script.

