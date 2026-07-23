# Automacao de documentos fiscais

## Objetivo

O modulo recebe XML ou PDF, extrai os campos fiscais, exige conferencia humana e somente depois concilia ou cria a compra. A leitura nunca grava uma compra diretamente e nao depende de credito da OpenAI.

## Fluxo

1. O arquivo passa por limite de tamanho, assinatura real, nome seguro e hash SHA-256.
2. O hash impede o mesmo arquivo de ser enviado duas vezes para a mesma empresa.
3. XML de NF-e ou NFS-e e interpretado de forma estruturada. DTD e entidades externas sao rejeitados.
4. PDF pesquisavel usa a camada de texto. PDF digitalizado e renderizado por pagina e lido pelo Tesseract em portugues.
5. Campos, itens, parcelas, alertas e nivel de confianca ficam disponiveis para revisao.
6. A triagem conservadora separa despesas de compras de servicos pessoais ou profissionais de saude.
7. O usuario confirma fornecedor, centro de custo, categoria, itens, parcelas e total.
8. A importacao procura uma compra existente antes de gravar qualquer dado.

## Regras de conciliacao

A ordem de procura e:

1. referencia interna do documento;
2. numero da nota e fornecedor;
3. fornecedor e valor total, quando existe uma unica compra sem numero de nota;
4. criacao de nova compra somente quando nenhuma correspondencia segura foi encontrada.

Quando fornecedor e valor ja existem em uma unica compra sem nota, o sistema completa o numero fiscal nessa compra. Correspondencias ambiguas bloqueiam a operacao para revisao. Forma de pagamento e parcelas podem ficar vazias sem impedir o registro.

## Limites e formatos

- PDF: ate 10 MB e 20 paginas.
- XML: ate 5 MB.
- Itens por documento: ate 500.
- Parcelas por documento: ate 120.
- Tipos aceitos: PDF, NF-e XML e NFS-e XML reconhecivel.

## OCR gratuito

O fallback usa Tesseract.js com o modelo oficial `por` de maior precisao disponivel no pacote. O documento e processado no servidor da aplicacao e nao e enviado para a OpenAI.

A imagem da API inclui o modelo em portugues e usa o cache em modo somente leitura. Assim, o primeiro documento digitalizado nao depende de acesso a internet nem tenta gravar arquivos no sistema somente leitura do container. O workflow de containers comprova essa disponibilidade executando a verificacao com a rede desativada.

`OCR_LANGUAGE_DATA_PATH` e apenas uma sobrescrita opcional para ambientes que administram o proprio modelo. O diretorio deve conter `por.traineddata.gz` ou `por.traineddata`; um caminho invalido interrompe a inicializacao da API:

```env
OCR_LANGUAGE_DATA_PATH=/app/tessdata
```

OCR pode confundir caracteres, colunas e separadores decimais. Por isso o resultado sempre permanece em revisao e o sistema valida CNPJ, datas, totais, itens e parcelas antes da importacao.

## Armazenamento privado

Crie no Supabase Storage um bucket privado chamado `invoice-documents` ou configure outro nome seguro:

```env
INVOICE_STORAGE_BUCKET=invoice-documents
```

O backend usa apenas a chave de servico no servidor. Caminho do arquivo, hash e identificador interno da empresa nao fazem parte da resposta publica da API. O navegador nao recebe URL publica nem chave de servico.

## Permissoes

- Leitura: membros autorizados da empresa.
- Envio, revisao, rejeicao e importacao: papeis com permissao de escrita em compras.
- Todas as consultas e mutacoes carregam o identificador da empresa ativa.
- Alteracoes de estado e importacoes produzem registros de auditoria.

## Estados

`PROCESSING`, `REVIEW_REQUIRED`, `READY`, `OUT_OF_SCOPE`, `IMPORTING`, `IMPORTED` e `FAILED` formam o ciclo do documento. A transicao atomica para `IMPORTING` impede duas importacoes concorrentes do mesmo arquivo.

## Operacao segura

- Mantenha o bucket privado e bloqueie acesso direto pelo cliente.
- Defina limites de requisicao tambem no proxy reverso.
- Monitore falhas de OCR, arquivos rejeitados e conciliacoes ambiguas.
- Nao elimine o arquivo fiscal antes de confirmar a politica legal de retencao da empresa.
- Teste amostras reais de cada municipio antes de automatizar novos layouts de NFS-e.
