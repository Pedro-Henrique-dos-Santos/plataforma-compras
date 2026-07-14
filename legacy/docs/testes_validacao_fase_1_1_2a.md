# Testes de Validação - Fase 1.1/2A

Use estes testes antes de usar o sistema em produção.

## 1. Estrutura

Executar no Apps Script:

```javascript
prepararEstruturaFase2A()
```

Resultado esperado:

- Nenhum dado histórico apagado.
- Aba `Parcelas do Pedido` com coluna `Status`.
- Abas de inteligência existentes e com filtros.

## 2. Sequência de pedido

Executar:

```javascript
localizarMaiorSequenciaDoAno_(2026)
```

Resultado esperado:

- Retornar pelo menos `7`, considerando que já existe `PED-2026-0007`.

## 3. Consistência do pedido divergente

Executar:

```javascript
validarConsistenciaPedido('PED-2026-0007')
```

Resultado esperado:

- Mostrar se `Itens`, `valores negociados` e `Parcelas` batem.
- Se houver divergência, executar:

```javascript
ressincronizarPedido('PED-2026-0007')
```

Depois repetir:

```javascript
validarConsistenciaPedido('PED-2026-0007')
```

## 4. Cadastro de fornecedor

Na aba `Cadastro de Fornecedores`, cadastrar uma linha de teste:

- CNPJ do Fornecedor: `00.000.000/0001-00`
- Razão Social: `Fornecedor Teste LTDA`
- Nome Comercial: `Fornecedor Teste`
- Categoria Padrão: `Descartáveis`
- Natureza da Operação Padrão: `Venda de mercadoria`
- Método de Pagamento Padrão: `Boleto Bancário`
- Centro de Custo Padrão: `Farmácia`
- Status: `Ativo`

Executar:

```javascript
buscarFornecedorInteligente('Fornecedor Teste')
```

Resultado esperado:

- Retornar objeto com fornecedor, categoria, método e centro de custo padrão.

## 5. Tabela de preço negociado

Na aba `Tabela de Preços Negociados`, cadastrar uma linha de teste:

- Fornecedor: `Fornecedor Teste`
- CNPJ: `00.000.000/0001-00`
- Item Padronizado: `Luva Procedimento P`
- Palavras-chave: `luva, procedimento`
- Unidade de Medida: `Caixa`
- Valor Unitário Inicial: `100`
- Valor Unitário Negociado: `90`
- Categoria: `Descartáveis`
- Centro de Custo: `Farmácia`
- Vigência Inicial: data de hoje
- Vigência Final: uma data futura
- Status: `Ativo`

Executar:

```javascript
buscarPrecoNegociado('Fornecedor Teste', 'Luva para procedimento tamanho P', new Date())
```

Resultado esperado:

- Retornar `Luva Procedimento P` com valor negociado `90`.

## 6. Regra de classificação

Na aba `Regras de Classificação`, cadastrar:

- Palavra-chave: `flyer`
- Categoria Sugerida: `Papelaria/Escritório`
- Centro de Custo Sugerido: `Marketing`
- Prioridade: `1`
- Status: `Ativo`

Executar:

```javascript
classificarItemPorRegras('Flyer tamanho grande para evento')
```

Resultado esperado:

- Retornar categoria `Papelaria/Escritório` e centro de custo `Marketing`.

## 7. Novo pedido completo

Cadastrar um pedido real pequeno pelo formulário atual.

Resultado esperado:

- Pedido recebe próximo número sequencial.
- Itens são gravados.
- Resumo é criado/atualizado em `valores negociados`.
- Rateio é criado.
- Parcelas são gravadas com `Status`.

