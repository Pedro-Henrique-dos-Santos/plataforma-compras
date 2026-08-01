# Ciclo integrado de compra, NF-e, recebimento e pagamento

## Escopo desta entrega

Esta versao conecta o Kanban de compras ao Kanban financeiro sem executar
transacoes bancarias. Ela implementa NF-e modelo 55, vinculo fiscal auditavel,
recebimento parcial, aprovacao financeira, instrucao Pix versionada, baixa com
comprovante e relatorios. NFS-e, CT-e, DDA e banco ficam fora do escopo.

O codigo esta preparado para homologacao. Captura real na SEFAZ exige migracao
aplicada, certificado A1 autorizado, endpoints oficiais configurados e aceite em
modo sombra.

## Estados

### Compra

1. `REGISTERED`: Cadastro.
2. `REQUESTED`: Solicitacao.
3. `AWAITING_APPROVAL`: Aguardando aprovacao.
4. `PURCHASE_ORDER`: Pedido de compra.
5. `SUPPLIER_INVOICED`: Faturado pelo fornecedor.
6. `RECEIVED`: Recebido integralmente.
7. `COMPLETED`: Recebido, conciliado e sem saldo financeiro.

### Titulo financeiro

1. `MATCHING_REQUIRED`: A conciliar.
2. `AWAITING_APPROVAL`: Aguardando aprovacao.
3. `READY_TO_PAY`: Liberado para pagamento.
4. `PARTIALLY_PAID`: Parcialmente pago.
5. `PAID`: Pago.

Vencimento e atraso sao alertas calculados. Eles nao mudam a coluna do titulo.

## Modelo de dados

- `PurchaseInvoiceLink`: relacao auditavel entre compra e documento fiscal.
- `FiscalDocumentItem`: item normalizado da NF-e vinculado opcionalmente ao item
  da compra.
- `GoodsReceipt` e `GoodsReceiptItem`: entrega, responsavel, data, observacao,
  item comprado, quantidade e linha fiscal opcional.
- `Installment`: titulo financeiro compativel com as parcelas existentes e
  vinculado opcionalmente ao documento fiscal.
- `PaymentInstructionSnapshot`: fotografia imutavel dos dados de pagamento.
- `PaymentApprovalRequest`, participantes e titulos: aprovacao por titulo ou
  fotografia do pedido.
- `PaymentSettlement`: baixa parcial ou total com comprovante privado.
- `PaymentSettings`, `PaymentApprovalRule` e aprovadores: configuracao por
  empresa.
- `ReceiptResponsibility`: responsavel padrao por empresa ou centro de custo.
- `FiscalIntegration`: configuracao A1, ambiente, cursores e saude por empresa.

Todas as tabelas operacionais possuem `organizationId`, RLS, privilegios
restritos e chaves estrangeiras compostas para impedir relacao entre tenants.

## Conciliacao fiscal

O worker processa `ultNSU/maxNSU`, descompacta `docZip` e deduplica por NSU,
chave de acesso e hash. A correspondencia automatica exige uma unica compra com:

- mesma empresa ativa;
- fornecedor com CNPJ equivalente ao emitente;
- referencia do pedido presente quando informada;
- itens compativeis;
- quantidades disponiveis;
- total compativel.

Uma unica divergencia envia o documento para revisao. A revisao manual exige
pedido, versao atual e justificativa; a rejeicao tambem exige motivo. O upload de
XML/PDF e OCR termina no mesmo fluxo de revisao e nunca contorna essas regras.

## Recebimento

O responsavel seleciona somente itens da compra e linhas fiscais vinculadas ao
pedido. A API valida dentro de transacao serializavel:

- tenant do pedido, NF-e, item e responsavel;
- quantidade positiva;
- saldo ainda nao recebido do item comprado;
- saldo ainda nao recebido da linha fiscal;
- correspondencia entre a linha fiscal e o item comprado.

Entregas parciais mantem o pedido faturado. O estado `RECEIVED` exige todos os
itens integralmente recebidos.

## Aprovacao financeira

`DISABLED` libera automaticamente apenas titulos conciliados. O salto e
auditado. `PER_TITLE` cria uma solicitacao para um titulo. O modo
`PER_PURCHASE_SNAPSHOT` inclui somente titulos elegiveis existentes naquele
instante; um titulo futuro fica fora da fotografia.

Cada regra define valor minimo, aprovadores e quorum um ou dois. Uma mudanca de
instrucao invalida solicitacoes pendentes ou aprovadas e devolve titulos com
saldo para conferencia. Adiantamento exige justificativa, evidencia e fluxo
extraordinario.

Quando a segregacao esta ativa:

- solicitante e aprovador da compra nao aprovam o pagamento;
- aprovador financeiro nao registra a propria baixa;
- permissoes continuam limitadas ao tenant ativo.

## Pix e baixas

O snapshot suporta chave Pix, copia-e-cola e QR opcional. A validacao confere
CPF/CNPJ, telefone, e-mail, UUID v4, TLV por comprimento em bytes, identificador
`BR.GOV.BCB.PIX`, formato, moeda 986, pais BR, valor, CRC e beneficiario esperado
do fornecedor.

Cada baixa exige valor, data, identificador bancario, usuario e comprovante. O
saldo e a soma decimal das baixas; multiplos comprovantes podem liquidar um
titulo. O arquivo fica em storage privado e a API emite somente link temporario
para usuario autorizado.

## Permissoes

O papel `FINANCE` usa permissoes separadas para leitura financeira, decisao de
aprovacao e baixa. Administracao de regras, configuracoes, responsabilidades e
certificados permanece com `ORGANIZATION_ADMIN` ou `PLATFORM_OWNER` conforme a
matriz compartilhada. `PLATFORM_OWNER` nunca pode ser concedido por uma empresa.

## Rotas principais

- `/procure-to-pay/payables`: Kanban e filtros financeiros.
- `/procure-to-pay/payment-settings`: modo de aprovacao e segregacao.
- `/procure-to-pay/payment-rules`: regras, aprovadores e quorum.
- `/procure-to-pay/payment-approvals`: solicitacoes e decisoes.
- `/procure-to-pay/payables/:id/instruction`: snapshot da instrucao.
- `/procure-to-pay/payables/:id/settlements`: baixa com comprovante.
- `/procure-to-pay/purchases/:id/receipts`: recebimentos.
- `/procure-to-pay/fiscal/integration`: configurar ou revogar A1.
- `/procure-to-pay/fiscal/sync`: consulta manual da Distribuicao DF-e.
- `/procure-to-pay/fiscal/documents`: caixa fiscal, revisao e manifestacao.

Todos os comandos mutaveis relevantes recebem a versao esperada do recurso.

## Rollout

1. Aplicar a migracao e reconciliar contagens, valores e vinculos legados.
2. Manter `FISCAL_SYNC_WORKER_ENABLED=false` durante a verificacao estrutural.
3. Configurar um A1 autorizado no ambiente de homologacao.
4. Habilitar o worker com `FISCAL_ROLLOUT_MODE=SHADOW`.
5. Comparar NSU, chaves, emitentes, totais e documentos sem correspondencia.
6. Autorizar `EXACT_MATCH` somente depois do aceite humano.
7. Avaliar `AUTO_SCIENCE` por empresa. Outros eventos permanecem manuais.

## Monitoramento

Alertar para atraso de NSU, cursor parado, certificado a vencer ou vencido,
indisponibilidade fiscal, documento sem correspondencia, notificacao falha,
aprovacao demorada, titulo vencido e saldo nao conciliado.

## Recuperacao

A migracao preserva `invoiceNumber`, parcelas e baixas existentes. Antes da
aplicacao, gere backup verificavel. Em falha, retire a nova API do trafego e
restaure a imagem anterior; nao reverta a migracao automaticamente. Restaure o
backup em banco separado, compare contagens e totais e escolha roll-forward ou
restauracao controlada conforme `docs/RECOVERY_RUNBOOK.md`.

## Referencias oficiais

- Portal NF-e, notas tecnicas: https://www.nfe.fazenda.gov.br/PORTal/listaConteudo.aspx?AspxAutoDetectCookieSupport=1&tipoConteudo=04BIflQt1aY%3D
- CNPJ alfanumerico: https://www.gov.br/receitafederal/pt-br/acesso-a-informacao/acoes-e-programas/programas-e-atividades/cnpj-alfanumerico
- Manual do digito verificador: https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj/manual-dv-cnpj.pdf
- Documentacao nacional de NFS-e: https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/documentacao-atual
