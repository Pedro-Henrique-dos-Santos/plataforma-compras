# Como substituir no Apps Script

Use estes dois arquivos como substituição completa:

- `Codigo.gs`
- `Formulario.html`

## Passo a passo

1. Abra a planilha.
2. Vá em **Extensões > Apps Script**.
3. Abra o arquivo principal do backend, geralmente `Código.gs` ou `Code.gs`.
4. Apague o conteúdo desse arquivo e cole todo o conteúdo de `Codigo.gs`.
5. Abra o arquivo `Formulario.html`.
6. Apague o conteúdo dele e cole todo o conteúdo de `Formulario.html`.
7. Salve o projeto.
8. Execute a função `prepararEstruturaFase2A`.
9. Autorize o script, se o Google pedir.
10. Volte para a planilha e recarregue a página.

## Depois de substituir

No menu **Compras Human Clinic**, use:

- **Preparar fase 2A** para garantir as abas de inteligência.
- **Abrir formulário** para testar o lançamento.
- **Ressincronizar pedido** para corrigir pedido já existente a partir dos itens.

## Teste recomendado

1. Cadastre uma regra em `Regras de Classificação`.
2. Abra o formulário.
3. Digite um item que contenha essa palavra-chave.
4. Clique em **Buscar sugestão** no item.
5. Confira se categoria, centro de custo e preços foram preenchidos quando houver cadastro.

