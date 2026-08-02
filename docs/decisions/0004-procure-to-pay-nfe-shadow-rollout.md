# ADR 0004: ciclo integrado e rollout fiscal em modo sombra

## Estado

Aceita para implementacao. Implantacao externa pendente de homologacao.

## Contexto

Uma compra pode ser faturada e entregue em partes, e um mesmo titulo pode ser
liquidado por varias baixas. O campo singular de nota e a marcacao direta de
pagamento nao preservam essa realidade nem oferecem auditoria suficiente. A
Distribuicao DF-e tambem envolve certificado A1, cursor de NSU e efeitos fiscais
que nao podem ser liberados de uma vez em producao.

## Decisao

- Manter dois Kanbans conectados, um por compra e outro por titulo.
- Modelar relacao muitos-para-muitos entre compra e documento fiscal.
- Registrar recebimento por item e opcionalmente por linha da NF-e.
- Registrar baixas independentes e derivar o saldo do titulo.
- Separar aprovacao financeira da aprovacao da compra.
- Congelar instrucoes de pagamento e invalidar aprovacoes depois de mudanca.
- Usar storage privado e links temporarios para documentos e comprovantes.
- Limitar a primeira captura automatica a NF-e modelo 55.
- Implantar em tres passos: `SHADOW`, `EXACT_MATCH` e `AUTO_SCIENCE` opcional.
- Nunca resolver divergencia fiscal ou financeira automaticamente.
- Nunca executar pagamento ou guardar credencial bancaria nesta fase.
- Exigir documento fiscal por padrao e permitir dispensa somente quando marcada
  explicitamente no pedido; boleto ou Pix nao implicam dispensa fiscal.
- Preservar numeros fiscais importados da planilha apenas como referencias
  historicas. Sem arquivo legivel, extracao e conciliacao validada, eles nao
  criam NF-e nem liberam recebimento.

## Consequencias

A operacao ganha rastreabilidade de entrega, conciliacao e saldo, mas passa a
exigir configuracao de responsaveis, regras financeiras, armazenamento privado
e monitoramento de worker. O modelo legado continua disponivel como campo
derivado durante a migracao, evitando uma quebra simultanea da planilha, API e
interface.

NFS-e, CT-e, DDA e bancos exigirao adaptadores proprios. A existencia desta
integracao NF-e nao autoriza reutilizar endpoints, eventos ou certificados fora
do protocolo correspondente.

## Criterios para mudar de modo

`SHADOW` somente captura. `EXACT_MATCH` requer amostra conciliada sem falsos
positivos e aceite formal. `AUTO_SCIENCE` exige avaliacao juridica e operacional
por empresa. Eventos conclusivos permanecem manuais.
