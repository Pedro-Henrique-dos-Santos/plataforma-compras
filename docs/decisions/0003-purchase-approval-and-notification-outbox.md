# ADR 0003: aprovacao de compras e notificacoes duraveis

## Status

Aceita.

## Contexto

O processo de compras precisa separar o preparo do pedido, a autorizacao da
compra, o recebimento fiscal e o acompanhamento financeiro. O envio direto de
e-mail ou WhatsApp dentro da transacao principal criaria risco de perder a
notificacao ou duplicar mensagens quando um provedor ficar indisponivel.

O Omie foi usado como referencia funcional para o Kanban, a permissao de
aprovacao, o bloqueio da associacao da nota antes da autorizacao e a separacao
entre aprovacao da compra e aprovacao do pagamento. O E-Gestao acrescenta
regras por valor e quorum configuravel, pois esse requisito pertence ao modelo
operacional do produto.

## Decisao

- Adotar sete etapas para a compra: `REGISTRATION`, `REQUESTED`,
  `AWAITING_APPROVAL`, `PURCHASE_ORDER`, `SUPPLIER_INVOICED`, `RECEIVED` e
  `COMPLETED`.
- Selecionar a regra ativa de maior valor minimo que ainda seja menor ou igual
  ao total da compra.
- Permitir quorum de uma ou duas aprovacoes e uma lista explicita de
  responsaveis por regra.
- Criar uma solicitacao e participantes imutaveis a cada envio. Nome da regra,
  total, canal, nome e destino dos aprovadores ficam congelados para auditoria.
- Registrar toda mudanca de etapa e toda decisao no PostgreSQL.
- Expor o historico de compras como consulta tabular por tenant, com filtros de
  periodo, usuario, acao, evento e pedido. A interface exibe o aprovador somente
  quando existe uma decisao `APPROVED` persistida para aquele participante.
- Bloquear edicao operacional depois do envio e impedir vinculacao fiscal antes
  da aprovacao.
- Separar aprovacao da compra do acompanhamento financeiro. A compra aprovada
  libera a etapa de pedido e pode gerar uma notificacao para o financeiro, mas
  nao executa o pagamento.
- Persistir notificacoes em uma outbox com deduplicacao, tentativas, recuperacao
  de processamento interrompido e erro sanitizado.
- Restringir a configuracao das regras ao administrador da empresa ou ao
  proprietario global. `PLATFORM_OWNER` continua sendo um papel global que
  nunca pode ser concedido pela empresa.

## Consequencias

- Uma indisponibilidade do SMTP ou da Meta nao desfaz a aprovacao.
- Regras alteradas no futuro nao mudam o historico de solicitacoes anteriores.
- Duas decisoes concorrentes sao serializadas pelo banco.
- A reprovacao devolve a compra para `REQUESTED` com motivo obrigatorio.
- O cancelamento encerra uma solicitacao pendente sem apagar seu historico.
- A operacao financeira permanece rastreavel, mas integracao bancaria, DDA,
  token financeiro e aprovacao de pagamento exigem uma fase propria.

