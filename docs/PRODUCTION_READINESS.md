# Prontidao para producao

## Estado do codigo

O codigo cobre identidade, multiempresa, papeis, cadastros, precos, compras, rateios, parcelas, conciliacao com Google Sheets, documentos fiscais, indicadores, relatorios e exportacao. A entrada em producao ainda depende da infraestrutura externa e da homologacao com dados reais.

## Verificacoes da API

- `GET /api/health/live` confirma que o processo responde.
- `GET /api/health/ready` confirma o acesso ao PostgreSQL fora do modo demonstrativo.
- Toda resposta recebe `x-request-id`.
- Cada requisicao gera um log JSON com metodo, caminho sem query string, status, duracao e identificador.
- A aplicacao encerra conexoes ao receber sinais de desligamento.

O balanceador deve retirar a instancia do trafego quando `ready` retornar `503`, mas reiniciar o processo somente quando `live` falhar.

## Verificacoes do banco no CI

- Um PostgreSQL descartavel recebe todas as migracoes com `pnpm db:deploy`.
- O catalogo e validado para garantir RLS em todas as tabelas da aplicacao.
- Chaves de negocio iguais sao exercitadas em duas empresas sem conflito entre tenants.
- Fornecedor e centro de custo de outra empresa sao rejeitados pelo repositorio.
- Dashboard, relatorio, compras, fornecedores e auditoria sao conferidos por organizacao.
- Um backup customizado e restaurado em outro banco, com reconciliacao de migracoes, RLS, contagens e totais.

## Alertas iniciais

Configurar alertas no provedor de hospedagem para:

- Duas falhas consecutivas de prontidao.
- Mais de 2% de respostas `5xx` em cinco minutos.
- Percentil 95 acima de um segundo por dez minutos.
- Falha em sincronizacoes com Google Sheets.
- Crescimento de documentos fiscais em `FAILED` ou `REJECTED`.
- Backup ausente dentro da janela definida.

Os limites sao pontos de partida e devem ser recalibrados depois da homologacao.

## Teste de carga leve

```bash
LOAD_TEST_URL=http://127.0.0.1:3333/api/health/ready pnpm load:smoke
```

O padrao executa 100 requisicoes com concorrencia 10 e falha quando ocorre erro ou o percentil 95 ultrapassa um segundo. Um endereco remoto exige `LOAD_TEST_CONFIRM=true` para evitar execucao acidental contra producao.

## Checklist de implantacao

1. Criar o projeto Supabase e guardar as credenciais no gerenciador de segredos.
2. Aplicar todas as migracoes Prisma e o endurecimento de acesso descrito em `supabase/README.md`.
3. Criar o bucket privado de notas fiscais.
4. Definir um proprietario global independente das empresas clientes.
5. Configurar HTTPS, CORS explicito e `TRUST_PROXY=true` somente atras de proxy confiavel.
6. Publicar API e interface em ambientes separados de homologacao e producao.
7. Executar testes de login, troca de empresa, isolamento, escrita, relatorios e recuperacao de senha.
8. Conciliar os totais da planilha e do PostgreSQL antes de alterar a fonte primaria.
9. Confirmar o ensaio automatizado do CI e repetir a restauracao com um backup da homologacao.
10. Liberar usuarios em grupos pequenos e manter o Apps Script disponivel durante a estabilizacao.

Em implantacoes, use `pnpm db:deploy`. O comando `pnpm db:migrate` e reservado ao desenvolvimento local porque pode criar ou alterar migracoes interativamente.
