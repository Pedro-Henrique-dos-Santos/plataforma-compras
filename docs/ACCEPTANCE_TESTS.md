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
7. Importar uma compra historica sem data de emissao e confirmar que ela aparece como `Sem data`, sem data sintetica.
8. Repetir a previa e a aplicacao da planilha e confirmar que nenhuma compra e duplicada.

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
4. Abrir o dashboard sem periodo e confirmar que ele mostra todo o historico, incluindo compras sem data nos totais.
5. Aplicar no dashboard filtros de periodo, fornecedor, departamento e categoria e conferir todos os indicadores e graficos.
6. Desmarcar a inclusao de pedidos sem data e confirmar a alteracao da contagem e dos totais.
7. Aplicar no relatorio filtros de periodo, fornecedor, departamento, categoria e status.
8. Exportar CSV e abrir no Excel sem execucao de formulas originadas dos dados.
9. Exportar o Excel resumido e conferir as seis abas gerenciais.
10. Exportar o Excel detalhado e conferir compras, itens, rateios, parcelas, documentos e fornecedores.
11. Na aba `Itens por mes`, reconciliar quantidade, numero de compras, fornecedores, gasto, economia e preco medio com os itens de origem.
12. Confirmar que compras sem data aparecem no grupo `Sem data` e nao entram em um mes artificial.

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
