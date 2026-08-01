# Contexto do projeto

## Objetivo

Construir uma plataforma de compras que o proprietario possa operar e levar para diferentes empresas como parte do seu servico profissional. O sistema centraliza cadastros, valores negociados, compras, notas fiscais, centros de custo e relatorios gerenciais.

## Origem

A primeira versao foi criada em Google Sheets e Google Apps Script. Ela possui portal externo, formulario de compras, dashboard, fornecedores, tabela de precos, leitura de nota fiscal e automacoes na planilha. Essa versao permanece operacional e esta preservada em `legacy/`.

## Decisoes confirmadas

- Migracao progressiva, sem reescrever e substituir tudo de uma vez.
- Front-end em React e TypeScript.
- Back-end em NestJS e TypeScript.
- PostgreSQL como banco relacional.
- Supabase Free para desenvolvimento e homologacao inicial.
- Arquitetura multiempresa desde o primeiro schema.
- Aprovacao de compras por valor, com quorum de uma ou duas pessoas e historico
  completo por empresa.
- Aprovacao da compra separada do pagamento; esta fase acompanha contas a pagar
  e notifica o financeiro, mas nao movimenta dinheiro.
- Dois Kanbans conectados: compras acompanha o pedido e recebimento, enquanto o
  financeiro acompanha cada titulo, aprovacao, saldo e baixa comprovada.
- Uma compra pode possuir varias NF-e e varios recebimentos parciais. O vinculo
  fiscal exato pode ser automatico; divergencia ou ambiguidade exige revisao.
- A captura fiscal automatica inicial cobre somente NF-e modelo 55. NFS-e,
  CT-e, DDA e integracao bancaria permanecem como adaptadores futuros.
- O papel empresarial `FINANCE` possui permissoes financeiras proprias. A
  segregacao de funcoes e configuravel e inicia desabilitada nas empresas atuais.
- O pagamento continua fora do E-Gestao nesta fase. O sistema nao recebe senha
  bancaria nem executa Pix; ele controla instrucao, aprovacao, comprovante,
  baixa parcial e auditoria.
- Notificacoes duraveis por e-mail ou WhatsApp oficial, configuradas somente no
  servidor e processadas fora da transacao principal.
- O proprietario global e independente das contas das empresas atendidas.
- `compras@humanclinic.com.br` pertence somente ao contexto Human Clinic e nao sera proprietario global.
- O nome do produto e E-Gestao Compras; o nome da empresa ativa continua variavel.
- A interface possui os temas Normal, Escuro e Branco e barra lateral recolhivel.
- Depois da autenticacao, o usuario escolhe entre os modulos Compras, Financeiro
  e Administracao. Cada modulo possui navegacao lateral propria, filtrada pelas
  permissoes da empresa ativa, sem separar os dados ou interromper os vinculos
  entre pedido, documento fiscal, recebimento e titulo financeiro.

## Ambientes conhecidos

- Planilha operacional: `1_JXod5CixgaBSPBvlsn1PhZ2_tNXPSkuB7lSQ3oEPf4`
- Projeto Apps Script: `1N6Wsvn2X7vr9lc3N8ZWSS591qk-zxt1AbCrQe2tEUoxQAkJgUJa8vlGE`
- Portal Apps Script: implantacao `AKfycbwO4q2X_LmQVhAsBC7du4ZRhf1XqpyCzB2nLGN9ezyuvyKwCxl7IF1X8pRNb7iuBRZJIA`

Os identificadores acima sao referencias operacionais, nao credenciais.
