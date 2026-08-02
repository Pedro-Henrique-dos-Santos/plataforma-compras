# Compras, aprovacoes e contas a pagar

## Referencia funcional

O estudo do Omie confirmou os seguintes principios:

- requisicao, pedido, aprovacao, faturamento, recebimento e conferencia formam
  etapas visiveis de um Kanban;
- somente usuarios autorizados aprovam pedidos;
- a nota fiscal de recebimento so pode ser associada depois da aprovacao;
- aprovacao da compra e aprovacao do pagamento sao controles separados;
- dados de pagamento do fornecedor podem alimentar a conta a pagar;
- notificacoes de aprovacao podem ser configuradas por canal;
- contas a pagar precisam distinguir pendencia, atraso, agendamento e baixa.

Referencias oficiais:

- [Checklist e etapas do Kanban de compras](https://ajuda.omie.com.br/pt-BR/articles/499169-checklist-do-modulo-compras-estoque-e-producao)
- [Aprovacao de pedidos de compra](https://ajuda.omie.com.br/pt-BR/articles/6328913-aprovando-pedidos-de-compra)
- [Aprovacao de pagamentos](https://ajuda.omie.com.br/pt-BR/articles/5985837-configurando-a-aprovacao-de-pagamentos)
- [Agendamento de pagamentos](https://ajuda.omie.com.br/pt-BR/articles/7176281-agendando-pagamentos-na-omie-cash-conta-completa)
- [Captura de boletos por DDA](https://ajuda.omie.com.br/pt-BR/articles/9198819-automatizando-a-captura-de-boletos-a-pagar-com-dda-da-omie-cash)

O E-Gestao usa esses conceitos como referencia, sem reproduzir telas, codigo ou
dependencias do Omie. O modelo acrescenta regras de valor e quorum duplo
especificas para a operacao multiempresa.

## Comparacao de arquitetura

| Ponto estudado | Referencia Omie | Decisao no E-Gestao |
| --- | --- | --- |
| Kanban | Requisicao, pedido, aprovacao, faturado, recebido e conferido | Acrescenta `Cadastro` antes da solicitacao e conserva sete etapas auditadas |
| Autorizacao | Permissao para aprovar pedidos | Regra por empresa, valor minimo, lista de responsaveis e quorum |
| Dupla aprovacao por valor | Nao foi localizada configuracao publica equivalente na documentacao consultada | Implementada com limite de uma ou duas decisoes distintas |
| Nota fiscal | Pedido aprovado pode ser associado a NF-e de recebimento | Vinculacao fiscal bloqueada antes de `Pedido de compra` |
| Avisos | Notificacoes configuraveis de pendencias | Outbox duravel, e-mail ou WhatsApp, repeticao e deduplicacao |
| Financeiro | Aprovacao de pagamento separada da aprovacao da compra | Liberacao para o financeiro separada; nao executa pagamento |
| Dados do fornecedor | Dados bancarios podem preencher o pagamento | Chave Pix, link HTTPS e referencias de pagamento alimentam parcelas e avisos |
| Boleto | Conta a pagar e captura DDA no ecossistema financeiro | Boleto registrado e reportado; DDA permanece integracao futura |
| Pagamento | Omie.CASH agenda e executa por meios suportados | Somente acompanhamento e baixa manual nesta fase |

## Etapas do E-Gestao

| Etapa | Finalidade | Estado da compra |
| --- | --- | --- |
| `Cadastro` | Preparacao inicial, ainda editavel | `DRAFT` |
| `Solicitacao` | Pedido interno pronto para revisao | `DRAFT` |
| `Aguardando aprovacao` | Regra e aprovadores congelados | `DRAFT` |
| `Pedido de compra` | Compra autorizada e formalizada | `REGISTERED` |
| `Faturado pelo fornecedor` | Nota emitida e vinculada | `REGISTERED` |
| `Recebido` | Entrada fisica ou fiscal confirmada | `REGISTERED` |
| `Concluido` | Processo conferido e encerrado | `REGISTERED` |

Importacoes de planilha e CSV representam historico ja formalizado e entram em
`Pedido de compra`. Uma nota importada entra em `Faturado pelo fornecedor`. Uma
compra manual nasce em `Cadastro`.

Movimentos de retorno exigem motivo. Uma compra com nota vinculada nao pode
voltar para `Solicitacao`, e a nota nao pode ser vinculada antes de
`Pedido de compra`.

## Regras de aprovacao

Cada empresa define regras ordenadas por valor minimo. Ao enviar uma compra, a
API escolhe a regra ativa com maior limite aplicavel ao total.

Exemplo:

| Regra | Valor minimo | Quorum | Responsaveis |
| --- | ---: | ---: | --- |
| Compras operacionais | R$ 0,00 | 1 | Gestor da unidade |
| Compras relevantes | R$ 5.000,00 | 1 | Gerente de compras, diretor |
| Compras criticas | R$ 10.000,00 | 2 | Gerente de compras, diretor |

O quorum atual aceita uma ou duas aprovacoes. A lista pode ter mais pessoas que
o quorum; as primeiras decisoes validas que o completarem aprovam a compra. Uma
reprovacao encerra a solicitacao e exige comentario.

Somente `ORGANIZATION_ADMIN` e `PLATFORM_OWNER` configuram regras. Os
responsaveis selecionaveis precisam ser membros ativos com papel
`ORGANIZATION_ADMIN` ou `BUYER`. O `PLATFORM_OWNER` tambem pode ser selecionado
quando possui vinculo ativo com a empresa; `REPORT_VIEWER` comum nao pode
aprovar.

O pedido conserva uma fotografia da regra, total, canal e destinatarios usados.
Uma alteracao posterior na regra nao reescreve o historico.

## Notificacoes

A solicitacao cria mensagens na tabela `notification_outbox`. O worker processa
a fila separadamente da transacao de aprovacao e aplica:

- chave de deduplicacao por evento e destinatario;
- estado `PENDING`, `PROCESSING`, `SENT` ou `FAILED`;
- recuperacao de mensagens presas em processamento;
- repeticao com espera exponencial e limite de tentativas;
- erro sanitizado, sem tokens ou credenciais;
- URL direta para o pedido no aplicativo.

Modos de entrega:

- `log`: homologacao sem envio externo;
- `live`: entrega real; mensagens `EMAIL` usam SMTP e mensagens `WHATSAPP`
  usam templates aprovados da API oficial da Meta.

O modo `live` exige pelo menos um provedor completo. Toda regra e destino
financeiro precisa usar um canal efetivamente configurado; mensagens destinadas
a um provedor ausente permanecem rastreaveis na outbox e seguem a politica de
tentativas e falha.

Variaveis principais:

```text
APP_WEB_URL
NOTIFICATION_WORKER_ENABLED
NOTIFICATION_DELIVERY_MODE
NOTIFICATION_POLL_INTERVAL_MS
NOTIFICATION_REQUEST_TIMEOUT_MS
SMTP_HOST
SMTP_PORT
SMTP_SECURE
SMTP_USER
SMTP_PASSWORD
SMTP_FROM
WHATSAPP_ACCESS_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_API_VERSION
WHATSAPP_TEMPLATE_LANGUAGE
WHATSAPP_APPROVAL_TEMPLATE
WHATSAPP_REJECTION_TEMPLATE
WHATSAPP_FINANCE_TEMPLATE
```

Parametros esperados nos templates da Meta:

- aprovacao: numero do pedido, fornecedor, total e URL;
- reprovacao: numero do pedido, fornecedor, total, motivo e URL;
- financeiro: numero do pedido, fornecedor, total, instrucao principal de
  pagamento e URL.

Credenciais nunca pertencem ao banco, ao navegador ou ao GitHub.

## Financeiro e contas a pagar

Depois da aprovacao, uma notificacao opcional informa ao financeiro:

- numero e fornecedor do pedido;
- total aprovado;
- parcelas e vencimentos;
- canal de pagamento;
- chave Pix, link de pagamento ou referencia do boleto, quando cadastrados;
- URL para revisao no sistema.

O relatorio de contas a pagar classifica:

- `UNSCHEDULED`: compra aprovada sem parcela;
- `PENDING`: parcela aberta dentro do prazo;
- `OVERDUE`: parcela aberta vencida;
- `PAID`: parcela baixada.

A tela permite filtrar por periodo, fornecedor, status, canal de pagamento e
etapa da compra. Os indicadores mostram aberto, vencido, a vencer em 7, 15 e 30
dias, pago e ainda sem programacao. Uma compra aprovada sem parcelas pode ser
agendada como uma conta unica pelo total integral. O Excel usa os mesmos dados e
filtros.

## Limites atuais

Esta fase nao:

- movimenta dinheiro;
- acessa conta bancaria;
- consulta DDA;
- valida saldo;
- gera token bancario;
- aprova ou agenda um pagamento no banco;
- importa automaticamente um boleto por API bancaria;
- executa antecipacao de recebiveis.

Essas capacidades exigem contrato com um provedor financeiro, consentimento
explicito, tratamento de webhooks, idempotencia bancaria, conciliacao e uma
alcada financeira separada da aprovacao de compras.

## Proxima evolucao recomendada

1. Homologar regras de R$ 5 mil e R$ 10 mil com usuarios sinteticos.
2. Configurar SMTP de homologacao e validar entrega, repeticao e deduplicacao.
3. Aprovar templates da Meta antes de habilitar WhatsApp.
4. Importar boletos apenas para uma caixa de revisao, nunca direto para baixa.
5. Escolher o provedor bancario e modelar `payment_intents`, eventos de webhook e
   aprovacao financeira.
6. Implementar conciliacao de pagamento antes de qualquer automacao de
   antecipacao.
