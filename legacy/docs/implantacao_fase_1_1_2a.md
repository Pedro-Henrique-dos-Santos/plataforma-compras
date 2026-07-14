# Implantação - Human Clinic Compras

Este roteiro inicia a Fase 1.1 e a Fase 2A sem apagar histórico.

## O que já foi feito na planilha

Na planilha **Planilha de valores negociados**, foram criadas as abas:

- Cadastro de Fornecedores
- Tabela de Preços Negociados
- Regras de Classificação
- Conferência da Nota Fiscal
- Log de Importações

As abas receberam cabeçalhos, filtros, linha 1 congelada e validações básicas de status/ação.

## Limite de acesso

O Codex conseguiu editar a planilha pelo Google Drive, mas não recebeu uma ferramenta própria para editar o projeto Apps Script diretamente por dentro do editor.

Por isso, a implantação do código deve ser feita pelo editor Apps Script:

1. Abrir a planilha.
2. Ir em **Extensões > Apps Script**.
3. Fazer backup do código atual.
4. Criar um novo arquivo chamado `Fase_1_1_2A.gs`.
5. Colar o conteúdo de `apps_script_patch_fase_1_1_2a.gs`.
6. Substituir no código antigo as funções marcadas como `SUBSTITUIR`.
7. Rodar `prepararEstruturaFase2A()` uma vez.

## Funções que devem substituir as antigas

No arquivo atual do Apps Script, substituir estas funções pelas versões do patch:

- `localizarMaiorSequenciaDoAno_(ano)`
- `garantirCabecalhoParcelas_(aba)`
- `gravarParcelas_(ss, numeroPedido, payload)`
- `adicionarParcelasPedido(payload)`
- `removerLinhasDoPedido_(aba, numeroPedido)`

## Funções novas adicionadas

O patch adiciona:

- `prepararEstruturaFase2A()`
- `ressincronizarPedido(numeroPedido)`
- `validarConsistenciaPedido(numeroPedido)`
- `buscarFornecedorInteligente(termo)`
- `buscarPrecoNegociado(fornecedorOuCnpj, descricaoItem, dataReferencia)`
- `classificarItemPorRegras(descricaoItem)`

## Menu recomendado

No `onOpen()`, adicionar estes itens ao menu:

```javascript
.addSeparator()
.addItem('Preparar fase 2A', 'prepararEstruturaFase2A')
.addItem('Ressincronizar pedido', 'abrirRessincronizacaoPedido')
```

A função `abrirRessincronizacaoPedido` ainda não está no patch. Ela pode ser criada depois como uma tela simples para pedir o número do pedido. Por enquanto, `ressincronizarPedido('PED-2026-0007')` pode ser executada manualmente no Apps Script.

## Proximo desenvolvimento recomendado

1. Corrigir o `Formulario.html` para aceitar `Status` da parcela.
2. Criar tela lateral para cadastrar fornecedores.
3. Criar tela lateral para cadastrar preços negociados.
4. Popular regras iniciais de classificação.
5. Criar importação de XML NF-e antes de qualquer OCR.
6. Depois disso, integrar Document AI para PDF/imagem.

