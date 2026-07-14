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

- [Proximo] Migrar fornecedores e centros de custo.
- [Proximo] Migrar tabela de precos e importacao em lote.
- [Proximo] Criar conciliacao entre planilha e PostgreSQL.

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
