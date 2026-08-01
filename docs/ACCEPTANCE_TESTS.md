# Roteiro de aceite operacional

Este documento define o aceite minimo para liberar uma versao do E-Gestao Compras. Os testes devem usar somente dados sinteticos ate a homologacao formal de uma empresa.

## 1. Barreiras automatizadas

Execute na raiz do repositorio:

```powershell
pnpm db:generate
pnpm db:validate
pnpm check
pnpm audit --prod
```

O GitHub Actions deve executar adicionalmente:

- aplicacao integral das migracoes em PostgreSQL descartavel;
- testes de isolamento por organizacao e das politicas RLS;
- tentativa negativa de relacionar registros de empresas diferentes, rejeitada pelas chaves estrangeiras compostas;
- testes dos guardas para UUID invalido, rota divergente, empresa inacessivel, papeis e proprietario global;
- inventario de todos os controllers e rejeicao de rota operacional sem autenticacao, tenant, guarda de permissao e permissao declarada;
- testes que rejeitam configuracao de producao com modo demonstracao, e-mail nao verificado ou origem CORS sem HTTPS;
- seed exclusivamente sintetico;
- backup, restauracao e reconciliacao de estrutura, contagens e valores.

Nenhuma liberacao pode prosseguir com teste, build, auditoria ou restauracao em falha.

### Fixture descartavel do aceite visual

O ambiente de homologacao pode receber uma identidade, empresa e base sintetica reservadas para o aceite visual. O provisionamento exige confirmacao explicita, e-mail no dominio `example.com` com o prefixo `codex-ui-acceptance` e senha temporaria forte:

```powershell
$env:UI_ACCEPTANCE_CONFIRM = "staging-only"
$env:UI_ACCEPTANCE_EMAIL = "codex-ui-acceptance+<sufixo>@example.com"
$env:UI_ACCEPTANCE_PASSWORD = "<senha-temporaria-forte>"
pnpm ui:acceptance:provision
```

Ao terminar, remova a fixture usando o mesmo e-mail. A limpeza nao recebe nem exige a senha:

```powershell
$env:UI_ACCEPTANCE_CONFIRM = "staging-only"
$env:UI_ACCEPTANCE_EMAIL = "codex-ui-acceptance+<sufixo>@example.com"
pnpm ui:acceptance:cleanup
```

As credenciais do Supabase devem existir somente no ambiente local protegido ou no gerenciador de segredos. A limpeza precisa ser executada mesmo quando alguma etapa do aceite falhar.

## 2. Identidade e multiempresa

1. Entrar no modo de demonstracao ou com uma identidade de homologacao.
2. Confirmar que o usuario visualiza somente as empresas permitidas.
3. Trocar a empresa ativa e confirmar a atualizacao dos dados da pagina.
4. Confirmar que `PLATFORM_OWNER` nao pode ser concedido por um administrador de empresa.
5. Validar os temas normal, escuro e branco e a barra lateral recolhivel.
6. Criar uma conta informando o nome exibido e marcando separadamente Termos de uso e Aviso de privacidade.
7. Confirmar pela interface e por chamada direta a API que o primeiro acesso fica bloqueado ate o aceite versionado dos dois documentos; somente consulta de identidade e gravacao do perfil permanecem disponiveis para concluir o consentimento.
8. Alterar o nome exibido em Configuracoes e confirmar a atualizacao no cabecalho sem mudar o e-mail autenticado.
9. Consultar em Configuracoes a versao e a data dos documentos aceitos.
10. Editar a empresa ativa, preencher razao social, CNPJ, e-mail, telefone, CEP e endereco e recarregar a pagina para confirmar a persistencia.
11. Confirmar que um usuario sem permissao administrativa nao consegue alterar outra empresa pela API.
12. Entrar como comprador e confirmar escrita em compras, fornecedores, precos, centros de custo e notas, mantendo as acoes de sincronizacao ocultas.
13. Entrar como leitor de relatorios e confirmar navegacao de consulta sem controles de criacao, edicao, importacao ou aplicacao.

## 3. Cadastros mestres

1. Criar um centro de custo com codigo unico na empresa.
2. Criar um fornecedor com CNPJ, categoria e centro de custo padrao.
3. Editar e inativar o fornecedor sem alterar outra empresa.
4. Cadastrar mais de um preco no mesmo lote.
5. Importar o modelo CSV e conferir erros por linha antes de gravar.
6. Confirmar que a tabela de precos nao exige quantidade do item.

### Integracao com Google Sheets

1. Salvar o ID da planilha e quatro nomes de abas diferentes na tela `Automacoes`.
2. Compartilhar a planilha como leitora com o e-mail exibido da conta de servico.
3. Executar `Verificar acesso` e confirmar titulo, quatro abas obrigatorias e horario da verificacao.
4. Confirmar nos logs ou no teste automatizado que o cliente solicita somente `spreadsheets.readonly`.
5. Configurar duas fontes com a mesma aba e confirmar que a verificacao rejeita o mapeamento.
6. Confirmar que a verificacao nao cria previa, lote, fornecedor, preco ou compra.
7. Gerar a previa somente depois da verificacao e revisar as acoes antes de aplicar.

## 4. Operacao de compras

1. Registrar uma compra com mais de um item.
2. Manter o centro de custo em automatico e confirmar o padrao do fornecedor.
3. Ratear um item entre departamentos e totalizar exatamente 100 por cento.
4. Informar preco original e negociado e conferir a economia calculada.
5. Salvar sem parcelas quando essa informacao nao existir.
6. Confirmar a compra no dashboard e no relatorio filtrado.
7. Importar uma compra historica sem data de emissao e confirmar que ela aparece como `Sem data`, sem data sintetica.
8. Repetir a previa e a aplicacao da planilha e confirmar que nenhuma compra e duplicada.
9. Abrir o detalhe, corrigir nota, itens, rateios e parcelas e confirmar o novo total no dashboard.
10. Tentar salvar uma versao antiga da compra e confirmar o aviso para recarregar os dados.
11. Usar uma fixture de homologacao com parcela previamente paga e confirmar que valor, vencimento, ordem e remocao ficam protegidos.
12. Cancelar com motivo e confirmar que a compra sai dos indicadores registrados sem ser apagada.
13. Filtrar as canceladas, reativar com motivo e confirmar o retorno aos indicadores e os eventos de auditoria.

## 5. Kanban, aprovacoes e financeiro

1. Criar uma compra manual e confirmar a entrada na coluna `Cadastro`.
2. Mover para `Solicitacao` e confirmar o evento no historico detalhado.
3. Tentar vincular uma nota antes da aprovacao e confirmar o bloqueio.
4. Como administrador, criar regras sinteticas para R$ 0, R$ 5.000 e
   R$ 10.000, deixando a ultima com quorum dois.
5. Confirmar que um leitor de relatorios nao aparece como aprovador e que um
   usuario de outra empresa e rejeitado pela API.
6. Enviar uma compra de cada faixa e confirmar a escolha da regra de maior
   limite aplicavel.
7. Confirmar que o total, regra, canal, nomes e destinos ficam congelados na
   solicitacao mesmo depois de editar a regra.
8. Aprovar uma compra de quorum simples e confirmar a promocao para
   `Pedido de compra`.
9. Registrar a primeira aprovacao de uma regra dupla e confirmar que o pedido
   permanece pendente; registrar a segunda e confirmar a promocao.
10. Tentar decidir duas vezes ou usar uma versao concorrente e confirmar a
    rejeicao sem duplicidade.
11. Reprovar com comentario, confirmar o retorno para `Solicitacao` e a
    notificacao correspondente.
12. Cancelar uma compra em aprovacao e confirmar o encerramento da solicitacao
    pendente sem apagar o historico.
13. No modo de entrega `log`, confirmar as mensagens de aprovacao, reprovacao e
    financeiro na outbox, com chaves de deduplicacao diferentes.
14. Em SMTP de homologacao, provocar uma falha temporaria e confirmar nova
    tentativa sem desfazer a decisao da compra.
15. Configurar o destino financeiro e confirmar que a mensagem aprovada inclui
    parcelas, vencimentos e Pix, boleto ou link disponivel.
16. Abrir Contas a pagar e conferir compras sem programacao, parcelas abertas,
    vencidas e pagas.
17. Agendar uma compra aprovada sem parcelas e confirmar a criacao de uma conta
    unica pelo total integral.
18. Alterar vencimento, referencia e baixa, recarregar e confirmar a
    persistencia e o controle concorrente.
19. Exportar o Excel financeiro e reconciliar aberto, vencido, pago, sem
    programacao e previsoes de 7, 15 e 30 dias.
20. Confirmar que nenhuma acao do sistema tenta executar pagamento bancario.

## 6. Automacao documental

Use os arquivos sinteticos em `apps/api/src/invoices/__fixtures__/` e `legacy/samples/`.

1. Enviar XML de NF-e e confirmar numero, chave, emissao, fornecedor, CNPJ, natureza, itens e total.
2. Enviar PDF pesquisavel e confirmar a extracao gratuita de texto.
3. Enviar imagem ou PDF sem texto e confirmar o fallback OCR em portugues.
4. Conferir a soma dos itens contra o total informado.
5. Manter parcelas e metodo de pagamento vazios quando ausentes no documento.
6. Marcar como fora do escopo uma descricao pessoal ou profissional excluida pela triagem.
7. Salvar a conferencia antes de permitir a importacao.
8. Confirmar a criacao ou vinculacao do fornecedor e a classificacao por centro de custo.
9. Repetir a importacao e confirmar `A nota ja foi importada.` sem criar outra compra.
10. Para fornecedor e valor ja existentes, confirmar o complemento da nota na compra encontrada.
11. Confirmar no workflow `Containers` que o modelo portugues e localizado com a rede desativada e sistema de arquivos somente leitura.

## 7. Dashboard e relatorios

1. Conferir comprado no periodo, economia, fornecedores e compras.
2. Conferir evolucao mensal e distribuicao por categoria.
3. Conferir o grafico de gastos por departamento contra os rateios das compras.
4. Abrir o dashboard sem periodo e confirmar que ele mostra todo o historico, incluindo compras sem data nos totais.
5. Aplicar no dashboard filtros de periodo, fornecedor, departamento e categoria e conferir todos os indicadores e graficos.
6. Desmarcar a inclusao de pedidos sem data e confirmar a alteracao da contagem e dos totais.
7. Informar data inicial e final, conferir as variacoes contra o intervalo imediatamente anterior de mesma duracao e confirmar que fornecedor, departamento e categoria permanecem aplicados.
8. Usar um periodo anterior sem valor e confirmar que o sistema nao apresenta um percentual inventado.
9. Aplicar no relatorio filtros de periodo, fornecedor, departamento, categoria,
   status e etapa do Kanban.
10. Exportar CSV e abrir no Excel sem execucao de formulas originadas dos dados.
11. Exportar o Excel resumido e conferir as seis abas gerenciais.
12. Exportar o Excel detalhado e conferir compras, itens, rateios, parcelas, documentos e fornecedores.
13. Na aba `Itens por mes`, reconciliar quantidade, numero de compras, fornecedores, gasto, economia e preco medio com os itens de origem.
14. Confirmar que compras sem data aparecem no grupo `Sem data` e nao entram em um mes artificial.

## 8. Responsividade e acessibilidade

1. Validar desktop em largura minima de 1280 pixels.
2. Validar dispositivo movel em 390 por 844 pixels.
3. Confirmar menu lateral sobreposto e botao de fechamento no modo movel.
4. Confirmar que formularios, tabelas e graficos nao causam sobreposicao incoerente.
5. Confirmar nomes acessiveis nos botoes, campos, graficos e navegacao principal.

## 9. Liberacao externa

Antes da producao:

1. Incorporar o workflow de homologacao na branch padrao.
2. Configurar o ambiente protegido `staging` e seus tres segredos.
3. Executar `Supabase Staging` com a confirmacao exigida.
4. Validar login real, isolamento e bucket privado no Supabase.
5. Executar backup e restauracao com dados sinteticos na homologacao.
6. Aplicar a migracao de workflow e confirmar RLS nas sete tabelas novas.
7. Configurar SMTP ou manter explicitamente o modo `log`; WhatsApp somente com
   templates e credenciais oficiais aprovados.
8. Publicar web e API em dominios HTTPS separados.
9. Repetir este roteiro antes da migracao controlada dos dados reais.
