# Prontidao para producao

## Estado do codigo

O codigo cobre identidade, multiempresa, papeis, cadastros, precos, compras, rateios, parcelas, conciliacao com Google Sheets, documentos fiscais, indicadores, relatorios e exportacao. A entrada em producao ainda depende da infraestrutura externa e da homologacao com dados reais.

## Estado da homologacao

- Todas as migracoes versionadas estao aplicadas no PostgreSQL de homologacao.
- O teste de integracao confirmou RLS em todas as tabelas e isolamento entre empresas.
- O primeiro lote real foi aplicado apos previa, reconciliacao e comparacao com o lote anterior.
- Uma segunda previa da mesma fonte nao apresentou criacoes nem atualizacoes, comprovando idempotencia.
- Dashboard, Excel resumido e Excel detalhado reconciliaram a mesma base operacional.
- Todas as abas dos dois arquivos foram renderizadas; nao foram encontrados erros de formula ou defeitos graves de layout.
- Um aceite autenticado descartavel validou o bloqueio da API antes do consentimento, a liberacao apos o aceite legal, isolamento multiempresa, cadastros mestres, precos em lote, compra, rateio, filtros, dashboard e exportacoes.
- Os arquivos XLSX resumido e detalhado foram validados pela API como respostas binarias, e todos os dados sinteticos foram removidos do banco e do provedor de autenticacao ao final.
- O aceite visual autenticado percorreu todas as areas operacionais em desktop de 1280 por 720 pixels e dispositivo movel de 390 por 844 pixels, incluindo menu responsivo, temas, filtros, formularios, tabelas, graficos e documentos fiscais.
- O aceite visual nao encontrou erros no console nem rolagem horizontal da pagina; os totais do dashboard e dos relatorios foram reconciliados, a fixture foi removida e uma segunda limpeza confirmou a idempotencia.
- `pnpm audit --prod` nao encontrou vulnerabilidades conhecidas depois da atualizacao controlada da dependencia transitiva `uuid`.

Ainda faltam a configuracao permanente do conector Google por conta de servico, a revisao juridica e a implantacao controlada.

## Verificacoes da API

- `GET /api/health/live` confirma que o processo responde.
- `GET /api/health/ready` confirma o acesso ao PostgreSQL fora do modo demonstrativo.
- Toda resposta recebe `x-request-id`.
- Cada requisicao gera um log JSON com metodo, caminho sem query string, status, duracao e identificador.
- A aplicacao encerra conexoes ao receber sinais de desligamento.
- As rotas XLSX usam resposta de arquivo transmitido, evitando serializacao acidental do `Buffer` como JSON.

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

## Privacidade e documentos legais

O produto registra versao e data do aceite dos Termos de uso e do Aviso de privacidade, com evento de auditoria. Esse mecanismo fornece rastreabilidade tecnica, mas nao representa por si so uma declaracao de conformidade integral com a LGPD.

Antes da producao, a empresa responsavel deve revisar os textos com assessoria juridica ou encarregado de dados, definir controlador e operadores, canal para direitos dos titulares, bases legais, prazos de retencao, procedimento de incidentes e contratos com provedores. Cada alteracao material deve gerar uma nova versao e exigir novo aceite.

## Teste de carga leve

```bash
LOAD_TEST_URL=http://127.0.0.1:3333/api/health/ready pnpm load:smoke
```

O padrao executa 100 requisicoes com concorrencia 10 e falha quando ocorre erro ou o percentil 95 ultrapassa um segundo. Um endereco remoto exige `LOAD_TEST_CONFIRM=true` para evitar execucao acidental contra producao.

## Checklist de implantacao

1. Criar o projeto Supabase e guardar as credenciais no gerenciador de segredos.
2. Cadastrar as credenciais somente no ambiente protegido `staging` do GitHub.
3. Executar o workflow manual `Supabase Staging` para migrar, testar o isolamento e provisionar o bucket privado.
4. Definir um proprietario global independente das empresas clientes.
5. Configurar HTTPS, CORS explicito e `TRUST_PROXY=true` somente atras de proxy confiavel.
6. Publicar API e interface em ambientes separados de homologacao e producao.
7. Executar testes de login, troca de empresa, isolamento, escrita, relatorios e recuperacao de senha.
8. Conciliar os totais da planilha e do PostgreSQL antes de alterar a fonte primaria.
9. Confirmar o ensaio automatizado do CI e repetir a restauracao com um backup da homologacao.
10. Aprovar juridicamente os Termos de uso, o Aviso de privacidade e o processo de atendimento aos titulares.
11. Liberar usuarios em grupos pequenos e manter o Apps Script disponivel durante a estabilizacao.

Em implantacoes, use `pnpm db:deploy`. O comando `pnpm db:migrate` e reservado ao desenvolvimento local porque pode criar ou alterar migracoes interativamente.
