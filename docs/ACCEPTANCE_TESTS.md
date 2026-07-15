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
- seed exclusivamente sintetico;
- backup, restauracao e reconciliacao de estrutura, contagens e valores.

Nenhuma liberacao pode prosseguir com teste, build, auditoria ou restauracao em falha.

## 2. Identidade e multiempresa

1. Entrar no modo de demonstracao ou com uma identidade de homologacao.
2. Confirmar que o usuario visualiza somente as empresas permitidas.
3. Trocar a empresa ativa e confirmar a atualizacao dos dados da pagina.
4. Confirmar que `PLATFORM_OWNER` nao pode ser concedido por um administrador de empresa.
5. Validar os temas normal, escuro e branco e a barra lateral recolhivel.

## 3. Cadastros mestres

1. Criar um centro de custo com codigo unico na empresa.
2. Criar um fornecedor com CNPJ, categoria e centro de custo padrao.
3. Editar e inativar o fornecedor sem alterar outra empresa.
4. Cadastrar mais de um preco no mesmo lote.
5. Importar o modelo CSV e conferir erros por linha antes de gravar.
6. Confirmar que a tabela de precos nao exige quantidade do item.

## 4. Operacao de compras

1. Registrar uma compra com mais de um item.
2. Manter o centro de custo em automatico e confirmar o padrao do fornecedor.
3. Ratear um item entre departamentos e totalizar exatamente 100 por cento.
4. Informar preco original e negociado e conferir a economia calculada.
5. Salvar sem parcelas quando essa informacao nao existir.
6. Confirmar a compra no dashboard e no relatorio filtrado.

## 5. Automacao documental

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

## 6. Dashboard e relatorios

1. Conferir comprado no periodo, economia, fornecedores e compras.
2. Conferir evolucao mensal e distribuicao por categoria.
3. Conferir o grafico de gastos por departamento contra os rateios das compras.
4. Aplicar filtros de periodo, fornecedor, departamento, categoria e status.
5. Exportar CSV e abrir no Excel sem execucao de formulas originadas dos dados.

## 7. Responsividade e acessibilidade

1. Validar desktop em largura minima de 1280 pixels.
2. Validar dispositivo movel em 390 por 844 pixels.
3. Confirmar menu lateral sobreposto e botao de fechamento no modo movel.
4. Confirmar que formularios, tabelas e graficos nao causam sobreposicao incoerente.
5. Confirmar nomes acessiveis nos botoes, campos, graficos e navegacao principal.

## 8. Liberacao externa

Antes da producao:

1. Incorporar o workflow de homologacao na branch padrao.
2. Configurar o ambiente protegido `staging` e seus tres segredos.
3. Executar `Supabase Staging` com a confirmacao exigida.
4. Validar login real, isolamento e bucket privado no Supabase.
5. Executar backup e restauracao com dados sinteticos na homologacao.
6. Publicar web e API em dominios HTTPS separados.
7. Repetir este roteiro antes da migracao controlada dos dados reais.
