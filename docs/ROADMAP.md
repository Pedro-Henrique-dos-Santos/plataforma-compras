# Roteiro de evolucao

## Fase 0: base versionada

- [Concluido] Preservar o Apps Script em `legacy/`.
- [Concluido] Criar monorepositorio, documentacao, verificacoes e GitHub privado.
- [Concluido] Entregar modo demonstracao executavel.

## Fase 1: identidade e empresas

- [Concluido] Criar o Supabase Free de homologacao na regiao de Sao Paulo.
- [Concluido] Aplicar as migracoes, habilitar RLS, bloquear tabelas operacionais e criar o bucket privado.
- [Concluido] Implementar login, recuperacao e redefinicao de acesso.
- [Concluido em homologacao] Adicionar criacao de conta com nome exibido, aceite versionado dos Termos de uso e do Aviso de privacidade e bloqueio da API enquanto o consentimento estiver pendente ou desatualizado.
- [Concluido] Criar organizacoes, convites, vinculos e troca de empresa ativa.
- [Concluido no codigo] Permitir editar nome, CNPJ, contato e endereco da empresa.
- [Concluido] Aplicar papeis e auditoria sem fluxo de aprovacao.
- [Concluido] Criar identidade E-Gestao, tres temas e barra lateral recolhivel.
- [Concluido] Bloquear acesso direto do navegador as tabelas operacionais.

## Fase 2: cadastros mestres

- [Concluido] Migrar fornecedores e centros de custo.
- [Concluido] Migrar tabela de precos e importacao em lote.
- [Concluido] Criar conciliacao entre planilha e PostgreSQL.
- [Concluido] Adicionar importacao XLSX com historico legado, previa e deduplicacao.
- [Concluido em homologacao] Preservar compras historicas sem data como pendencia, sem excluir o pedido nem inventar emissao.

## Fase 3: operacao de compras

- [Concluido] Migrar cadastro de compras, itens, rateios e parcelas.
- [Concluido em homologacao] Adicionar detalhe, correcao transacional, cancelamento e reativacao auditados, com protecao das parcelas pagas.
- [Concluido] Incorporar notas fiscais XML e PDF, OCR gratuito, revisao e conciliacao no fluxo externo.
- [Concluido no codigo e CI] Empacotar o modelo OCR em portugues e eliminar downloads durante a execucao.
- [Concluido] Garantir idempotencia, isolamento por empresa e auditoria das gravacoes.

## Fase 4: inteligencia

- [Concluido] Migrar dashboard e indicadores para consultas do banco.
- [Concluido] Criar filtros por empresa e exportacoes CSV e XLSX.
- [Concluido no codigo e testes] Consolidar economia negociada, comparacao com o intervalo anterior e gastos por departamento.
- [Concluido em homologacao] Exibir todo o historico por padrao e filtrar dashboard por periodo, fornecedor, centro de custo e categoria.
- [Concluido em homologacao] Separar Excel resumido e detalhado, incluindo consolidacao mensal dos itens comprados.

## Fase 5: producao

- [Concluido no codigo] Testes de carga, seguranca e recuperacao.
- [Concluido no codigo] Backups, prontidao, observabilidade e plano de alertas.
- [Concluido no CI] Aplicar migracoes em PostgreSQL descartavel e testar isolamento multiempresa e RLS.
- [Concluido no codigo e CI] Impedir no PostgreSQL relacoes cruzadas entre tenants com chaves estrangeiras compostas e verificacao automatizada.
- [Concluido no codigo e testes] Cobrir os guardas de tenant e permissoes, incluindo UUID invalido, rota divergente e privilegio global.
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
- [Pendente externo] Aprovar juridicamente os Termos de uso, o Aviso de privacidade e o processo LGPD.
- [Pendente externo] Configurar hospedagem, dominios HTTPS, ambientes protegidos, segredos e alertas de producao.
- [Pendente externo] Criar backup de corte, publicar a tag imutavel e executar a implantacao controlada.
- [Pendente externo] Liberar o piloto, reconciliar os totais finais e desligar gradualmente o Apps Script.
