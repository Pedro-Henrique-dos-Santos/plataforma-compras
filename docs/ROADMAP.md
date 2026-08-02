# Roteiro de evolucao

## Fase 0: base versionada

- [Concluido] Preservar o Apps Script em `legacy/`.
- [Concluido] Criar monorepositorio, documentacao, verificacoes e GitHub privado.
- [Concluido] Entregar modo demonstracao executavel.
- [Concluido em homologacao em 2026-08-01] Tornar o runtime local persistente
  por padrao, com validacao do destino e modo demonstracao somente explicito.

## Fase 1: identidade e empresas

- [Concluido] Criar o Supabase Free de homologacao na regiao de Sao Paulo.
- [Concluido] Aplicar as migracoes, habilitar RLS, bloquear tabelas operacionais e criar o bucket privado.
- [Concluido] Implementar login, recuperacao e redefinicao de acesso.
- [Concluido em homologacao] Adicionar criacao de conta com nome exibido, aceite versionado dos Termos de uso e do Aviso de privacidade e bloqueio da API enquanto o consentimento estiver pendente ou desatualizado.
- [Concluido] Criar organizacoes, convites, vinculos e troca de empresa ativa.
- [Concluido no codigo] Permitir editar nome, CNPJ, contato e endereco da empresa.
- [Concluido] Aplicar papeis, permissoes e auditoria multiempresa.
- [Concluido no codigo e testes] Derivar menu e controles de escrita da interface pela mesma matriz de permissoes usada na API.
- [Concluido] Criar identidade E-Gestao, tres temas e barra lateral recolhivel.
- [Concluido no codigo e testes] Criar o lancador central de modulos e separar
  as navegacoes contextuais de Compras, Financeiro e Administracao, preservando
  o fluxo integrado entre as areas.
- [Concluido] Bloquear acesso direto do navegador as tabelas operacionais.

## Fase 2: cadastros mestres

- [Concluido] Migrar fornecedores e centros de custo.
- [Concluido] Migrar tabela de precos e importacao em lote.
- [Concluido] Criar conciliacao entre planilha e PostgreSQL.
- [Concluido] Adicionar importacao XLSX com historico legado, previa e deduplicacao.
- [Concluido em homologacao] Preservar compras historicas sem data como pendencia, sem excluir o pedido nem inventar emissao.
- [Concluido no codigo e testes] Consultar fornecedor por CNPJ por adaptador de
  back-end, preencher endereco e situacao cadastral para revisao sem gravacao automatica.

## Fase 3: operacao de compras

- [Concluido] Migrar cadastro de compras, itens, rateios e parcelas.
- [Concluido em homologacao] Adicionar detalhe, correcao transacional, cancelamento e reativacao auditados, com protecao das parcelas pagas.
- [Concluido no codigo e testes] Criar Kanban com cadastro, solicitacao,
  aprovacao, pedido, faturamento, recebimento e conclusao.
- [Concluido no codigo e testes] Ampliar o Kanban para o espaco operacional,
  usar colunas continuas e permitir retorno administrativo com motivo opcional por empresa.
- [Concluido no codigo e testes] Configurar regras por valor, quorum de uma ou
  duas pessoas, aprovadores por empresa e historico imutavel das decisoes.
- [Concluido no codigo e testes] Bloquear edicao e vinculacao fiscal antes da
  aprovacao, tratar reprovacao e encerrar solicitacoes no cancelamento.
- [Concluido no codigo e testes] Criar outbox duravel e entrega por log, SMTP ou
  templates oficiais do WhatsApp.
- [Concluido no codigo e testes] Notificar o financeiro depois da aprovacao com
  parcelas e instrucoes de pagamento do fornecedor.
- [Concluido no codigo e testes] Criar contas a pagar, faixas de vencimento,
  agendamento de compra sem parcelas, baixa e exportacao Excel.
- [Concluido] Incorporar notas fiscais XML e PDF, OCR gratuito, revisao e conciliacao no fluxo externo.
- [Concluido no codigo e CI] Empacotar o modelo OCR em portugues e eliminar downloads durante a execucao.
- [Concluido] Garantir idempotencia, isolamento por empresa e auditoria das gravacoes.

## Fase 4: inteligencia

- [Concluido] Migrar dashboard e indicadores para consultas do banco.
- [Concluido] Criar filtros por empresa e exportacoes CSV e XLSX.
- [Concluido no codigo e testes] Consolidar economia negociada, comparacao com o intervalo anterior e gastos por departamento.
- [Concluido em homologacao] Exibir todo o historico por padrao e filtrar dashboard por periodo, fornecedor, centro de custo e categoria.
- [Concluido em homologacao] Separar Excel resumido e detalhado, incluindo consolidacao mensal dos itens comprados.
- [Concluido no codigo e testes] Filtrar relatorios por etapa do Kanban e
  incluir a etapa nas exportacoes resumida e detalhada.
- [Concluido no codigo e testes] Criar relatorio financeiro de contas a pagar
  com aberto, vencido, pago, sem programacao e previsoes de 7, 15 e 30 dias.
- [Concluido no codigo e testes] Criar contas a receber com filtros, baixas
  parciais, saldo auditavel, relatorio e exportacao Excel por empresa.

## Fase 3B: ciclo integrado NF-e, recebimento e pagamento

- [Concluido no codigo e testes] Substituir o vinculo singular por relacao
  auditavel de varias NF-e por compra, preservando os campos legados derivados.
- [Concluido no codigo e testes] Registrar recebimentos parciais por item, linha
  fiscal, responsavel e centro de custo, com validacao de saldo e concorrencia.
- [Concluido no codigo e testes] Criar Kanban financeiro por titulo, baixas
  parciais com comprovante privado e saldo calculado.
- [Concluido no codigo e testes] Implementar os modos `DISABLED`, `PER_TITLE` e
  `PER_PURCHASE_SNAPSHOT`, regras por valor e quorum separado da compra.
- [Concluido no codigo e testes] Adicionar instrucao Pix versionada, validacao
  EMV/CRC/beneficiario e invalidacao de aprovacao quando os dados mudarem.
- [Concluido no codigo e testes] Adicionar papel `FINANCE`, permissoes proprias,
  responsabilidade de recebimento e segregacao opcional de funcoes.
- [Concluido no codigo e testes] Criar integracao A1 por tenant, worker com NSU,
  idempotencia, espera adaptativa e manifestacao manual.
- [Concluido no codigo e testes] Integrar upload XML/PDF e OCR ao mesmo vinculo
  fiscal auditavel como alternativa a Distribuicao DF-e.
- [Concluido no codigo e testes] Incluir documentos, recebimentos, saldo,
  situacao financeira e baixas nas exportacoes Excel.
- [Concluido em homologacao em 2026-08-01] Aplicar a migracao
  `202608010001_procure_to_pay_nfe` e reconciliar contagens e valores existentes.
- [Concluido em homologacao em 2026-08-01] Aplicar a migracao
  `202608010002_receivables_workflow_supplier_lookup`; as tabelas novas iniciam
  vazias e prontas para o aceite funcional.
- [Pendente externo] Homologar A1 e SEFAZ em modo `SHADOW`, sem manifestacao ou
  vinculo automatico, usando uma empresa e certificado autorizados.
- [Pendente externo] Liberar `EXACT_MATCH` somente depois de comparar capturas,
  totais e documentos sem correspondencia com a operacao real.
- [Pendente externo] Avaliar `AUTO_SCIENCE` por empresa; eventos conclusivos
  continuarao exigindo confirmacao humana.
- [Pendente futuro] Implementar adaptadores separados para NFS-e nacional e
  municipal, CT-e, DDA e integracao bancaria.

## Fase 5: producao

- [Concluido no codigo] Testes de carga, seguranca e recuperacao.
- [Concluido no codigo] Backups, prontidao, observabilidade e plano de alertas.
- [Concluido no CI] Aplicar migracoes em PostgreSQL descartavel e testar isolamento multiempresa e RLS.
- [Concluido no codigo e CI] Impedir no PostgreSQL relacoes cruzadas entre tenants com chaves estrangeiras compostas e verificacao automatizada.
- [Concluido no codigo e testes] Cobrir os guardas de tenant e permissoes, incluindo UUID invalido, rota divergente e privilegio global.
- [Concluido no codigo e testes] Inventariar todos os controllers e impedir novas rotas operacionais sem autenticacao, tenant e permissao explicita.
- [Concluido no codigo e testes] Recusar a inicializacao de producao com modo demonstracao, identidade sem e-mail verificado ou origem CORS sem HTTPS.
- [Concluido no CI] Executar backup, restauracao integral e reconciliacao em banco descartavel.
- [Concluido em homologacao] Executar aceite autenticado descartavel de identidade, isolamento, cadastros, precos, compras, rateios, filtros, dashboard e exportacoes, com limpeza integral ao final.
- [Concluido] Auditar dependencias de producao e eliminar vulnerabilidades conhecidas.
- [Concluido] Executar migracoes e validar o Supabase de homologacao e o bucket privado.
- [Concluido em homologacao] Criar o proprietario global independente e a primeira empresa cliente.
- [Concluido em homologacao] Aplicar o primeiro lote real, reconciliar os totais e comprovar a idempotencia da importacao.
- [Concluido em homologacao] Gerar e inspecionar os relatorios XLSX resumido e detalhado a partir do PostgreSQL.
- [Concluido em homologacao] Executar o aceite visual autenticado em desktop de 1280 por 720 pixels e dispositivo movel de 390 por 844 pixels, sem erros de console ou rolagem horizontal da pagina.
- [Concluido no codigo] Empacotar web e API em imagens separadas, nao privilegiadas e com health checks.
- [Concluido no codigo] Validar conteineres no CI e preparar publicacao versionada no GitHub Container Registry.
- [Concluido no codigo] Proteger migracoes de producao com tag imutavel, referencia de backup, confirmacao explicita e verificacao de RLS.
- [Concluido] Aprovar e mesclar o pull request 7 na `main` com CI verde.
- [Concluido no codigo] Validar credencial, compartilhamento e abas do Google Sheets com escopo somente leitura antes da previa.
- [Pendente externo] Configurar a conta de servico permanente do Google e validar a sincronizacao autenticada.
- [Concluido em homologacao em 2026-08-01] Aplicar a migracao de aprovacao no
  Supabase de homologacao.
- [Pendente externo] Executar o aceite multiusuario do fluxo de aprovacao.
- [Pendente externo] Configurar SMTP de homologacao e comprovar entrega,
  repeticao e deduplicacao.
- [Pendente externo] Aprovar templates da Meta e configurar o WhatsApp oficial,
  caso esse canal seja habilitado.
- [Pendente futuro] Escolher provedor bancario para DDA, webhooks, execucao e
  conciliacao bancaria. Nenhum pagamento sera executado antes dessa fase.
- [Pendente externo] Aprovar juridicamente os Termos de uso, o Aviso de privacidade e o processo LGPD.
- [Pendente externo] Configurar hospedagem, dominios HTTPS, ambientes protegidos, segredos e alertas de producao.
- [Pendente externo] Criar backup de corte, publicar a tag imutavel e executar a implantacao controlada.
- [Pendente externo] Liberar o piloto, reconciliar os totais finais e desligar gradualmente o Apps Script.
