# Execucao local persistente

## Objetivo

O E-Gestao pode rodar localmente em varios computadores sem usar dados de
demonstracao. Web e API executam em cada maquina, enquanto um unico projeto
PostgreSQL/Supabase hospedado guarda os registros. Assim, uma compra salva em
casa fica disponivel na empresa depois de autenticar o mesmo usuario autorizado.

Uma base PostgreSQL instalada separadamente em cada computador nao compartilha
dados. Esse modelo so serve para desenvolvimento isolado ou operacao offline com
um processo de sincronizacao que ainda nao existe no projeto.

## Preparar cada computador

1. Instale Node.js 22 ou superior, Git e pnpm 11.
2. Clone o mesmo repositorio e selecione a versao aprovada.
3. Execute `Copy-Item .env.example .env.local` na raiz.
4. Preencha `.env.local` com o mesmo projeto Supabase de homologacao.
5. Nunca envie esse arquivo por Git, e-mail ou mensagem. Distribua os segredos
   por um gerenciador de credenciais.
6. Execute os comandos abaixo.

```powershell
pnpm install
pnpm local:check
pnpm local:setup
pnpm dev
```

`local:setup` e idempotente: gera o Prisma, aplica migracoes pendentes, verifica
as protecoes multiempresa e cria o armazenamento privado quando necessario.
No Windows, encerre uma API que ja esteja rodando antes desse comando; o processo
aberto mantem o binario do Prisma bloqueado. Depois de concluir, inicie novamente
com `pnpm dev`.

## Confirmar o modo correto

- Interface: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:3333/api`
- Prontidao: `http://127.0.0.1:3333/api/health/ready`

A prontidao deve responder com `status: ready` e `persistence: database`. A tela
de acesso deve pedir uma conta cadastrada. Se houver uma entrada de demonstracao,
o processo iniciado nao e o runtime operacional atual.

`pnpm dev` nunca recua silenciosamente para memoria. Configuracao ausente encerra
a inicializacao com a lista das variaveis faltantes. `pnpm dev:demo` e a unica
entrada destinada a dados temporarios.

## Atualizar a partir do GitHub

Encerre o `pnpm dev` atual com `Ctrl+C` antes da atualizacao.

```powershell
git pull
pnpm install
pnpm local:check
pnpm local:setup
pnpm dev
```

As migracoes precisam ser aplicadas antes de uma API nova usar tabelas novas.
Antes de uma alteracao estrutural em ambiente com dados reais, gere e verifique
um backup conforme `docs/RECOVERY_RUNBOOK.md`.

## NF-e e SEFAZ

O codigo consulta a Distribuicao DF-e da NF-e modelo 55 por certificado A1 do
CNPJ da organizacao. Cada empresa possui ambiente, certificado, validade,
`ultNSU`, `maxNSU`, saude e proxima tentativa independentes. XMLs repetidos sao
deduplicados por chave, NSU e hash.

A integracao nao fica ativa apenas porque o sistema iniciou. Para homologar:

1. Um administrador cadastra CNPJ, ambiente e certificado A1 valido na empresa.
2. A API testa o certificado e o endpoint oficial sem expor senha ou arquivo.
3. A sincronizacao inicia em `SHADOW`: captura e armazena, mas nao manifesta nem
   vincula documentos automaticamente.
4. A operacao compara emissor, pedido, itens, quantidades, valores e cursor NSU.
5. Somente depois do aceite libera-se `EXACT_MATCH` para correspondencias
   integrais e unicas.
6. `AUTO_SCIENCE` permanece opcional por empresa; eventos conclusivos exigem
   confirmacao humana.

Sem certificado A1 autorizado, a SEFAZ nao pode ser testada de ponta a ponta. O
upload manual de XML/PDF e o OCR continuam disponiveis como alternativa.

## Opcao totalmente local

O Supabase CLI pode iniciar PostgreSQL, Auth e Storage locais com Docker. Os
dados permanecem entre paradas normais, mas pertencem somente aquela maquina e
o ambiente nao deve ser exposto como producao. Para compartilhar a operacao
entre casa e empresa, use o projeto hospedado central.
