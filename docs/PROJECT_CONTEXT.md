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
- Notificacoes duraveis por e-mail ou WhatsApp oficial, configuradas somente no
  servidor e processadas fora da transacao principal.
- O proprietario global e independente das contas das empresas atendidas.
- `compras@humanclinic.com.br` pertence somente ao contexto Human Clinic e nao sera proprietario global.
- O nome do produto e E-Gestao Compras; o nome da empresa ativa continua variavel.
- A interface possui os temas Normal, Escuro e Branco e barra lateral recolhivel.

## Ambientes conhecidos

- Planilha operacional: `1_JXod5CixgaBSPBvlsn1PhZ2_tNXPSkuB7lSQ3oEPf4`
- Projeto Apps Script: `1N6Wsvn2X7vr9lc3N8ZWSS591qk-zxt1AbCrQe2tEUoxQAkJgUJa8vlGE`
- Portal Apps Script: implantacao `AKfycbwO4q2X_LmQVhAsBC7du4ZRhf1XqpyCzB2nLGN9ezyuvyKwCxl7IF1X8pRNb7iuBRZJIA`

Os identificadores acima sao referencias operacionais, nao credenciais.
