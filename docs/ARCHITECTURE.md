# Arquitetura

## Visao geral

```text
Navegador
  -> React/Vite (Supabase Auth)
  -> API NestJS (identidade, tenant e permissoes)
  -> PostgreSQL/Supabase (dados operacionais)
  -> Worker fiscal NF-e modelo 55 (SEFAZ Distribuicao DF-e)
  -> Worker de notificacoes (SMTP ou WhatsApp oficial)
  -> Storage privado (XML, PDF, QR Pix e comprovantes)
  -> Google Sheets API (conciliacao durante a transicao)
  -> Google Drive para documentos durante a transicao
```

O front-end nunca recebe a chave privilegiada do banco. A API valida o token do Supabase, a identidade local, a empresa ativa, o papel e a permissao antes de executar operacoes.

Um contrato automatizado inventaria todos os controllers da API. Rotas operacionais precisam combinar `AuthGuard`, `OrganizationAccessGuard`, `PermissionsGuard` e uma permissao declarada; saude, conclusao do perfil e administracao global possuem politicas excepcionais explicitas. Um novo controller sem classificacao faz a suite falhar.

Respostas da API usam `Cache-Control: no-store`, e a interface desativa o cache nas requisicoes operacionais. Isso evita reutilizar identidade, permissoes, indicadores ou dados empresariais depois de uma troca de sessao ou empresa.

O navegador nao acessa tabelas operacionais pelo cliente Supabase. O Row Level Security fica habilitado sem politicas para `anon` e `authenticated`, e os privilegios de `PUBLIC`, `anon` e `authenticated` sao revogados. Somente a API usa a conexao PostgreSQL protegida. O CI consulta o catalogo do PostgreSQL e falha se uma tabela da aplicacao for criada sem RLS.

O cadastro de identidade separa o e-mail autenticado do nome exibido na plataforma. Os Termos de uso e o Aviso de privacidade possuem versoes independentes; a API grava a versao, a data, o endereco de rede disponivel e o agente do navegador em evento de auditoria. Uma nova versao volta a bloquear o acesso ate que os dois documentos sejam aceitos novamente.

## Multiempresa

Um usuario pode participar de varias organizacoes por meio de `OrganizationMembership`. Cada requisicao autenticada possui uma empresa ativa. O cabecalho `x-organization-id` deve ser um UUID valido, precisa coincidir com o tenant presente na rota e somente e promovido ao contexto ativo depois da verificacao do vinculo. Todas as entidades operacionais carregam `organizationId` e sao filtradas por esse identificador.

O papel global `PLATFORM_OWNER` fica separado dos papeis da organizacao. Isso impede que um administrador de cliente promova usuarios para administrar a plataforma inteira.

Os e-mails autorizados a receber o papel global ficam em `PLATFORM_OWNER_EMAILS`, configurado somente no back-end. Contas como `compras@humanclinic.com.br` permanecem vinculadas apenas a empresa cliente.

API e interface consomem a mesma matriz compartilhada de permissoes. O menu usa permissoes de leitura, e cada tela recebe capacidades especificas de escrita; por exemplo, o comprador opera compras e cadastros, mas nao recebe controles de sincronizacao porque nao possui `integration:write`. O leitor de relatorios permanece somente leitura, enquanto o proprietario global recebe todas as capacidades sem depender do papel na empresa ativa.

## Papeis iniciais

| Papel | Escopo | Uso |
| --- | --- | --- |
| `PLATFORM_OWNER` | Plataforma | Cria empresas, administra acessos globais e consulta todos os ambientes |
| `ORGANIZATION_ADMIN` | Empresa | Administra usuarios e dados de uma empresa |
| `BUYER` | Empresa | Opera compras, fornecedores, precos e notas |
| `FINANCE` | Empresa | Consulta titulos, decide aprovacoes financeiras e registra baixas conforme permissao |
| `REPORT_VIEWER` | Empresa | Consulta dashboards e relatorios |

O aprovador nao e um papel global adicional. Cada regra seleciona membros ativos
da empresa com papel `ORGANIZATION_ADMIN` ou `BUYER`; o `PLATFORM_OWNER`
tambem pode participar quando possui vinculo ativo com a empresa. O
`ORGANIZATION_ADMIN` configura as regras da propria empresa e o
`PLATFORM_OWNER` pode administra-las globalmente; `REPORT_VIEWER` permanece
somente leitura.

## Persistencia

O schema PostgreSQL usa chaves UUID, valores monetarios em `Decimal`, datas de auditoria e relacionamentos explicitos. PDFs permanecem fora do banco; o banco armazena metadados e links controlados.

O modo `demo` usa repositorios em memoria com os mesmos contratos das implementacoes Prisma. Em homologacao e producao, os repositorios Prisma sao selecionados automaticamente e persistem usuarios, empresas, vinculos, centros de custo, fornecedores, precos, compras, itens, rateios, parcelas e auditoria no PostgreSQL.

O workflow acrescenta configuracoes e regras de aprovacao, responsaveis,
solicitacoes, decisoes, historico de etapas e uma outbox de notificacoes. As
solicitacoes conservam fotografias do total, regra, canal e destinatarios usados
naquele envio, evitando que uma configuracao futura altere a auditoria passada.

O cadastro da organizacao mantem nome exibido, razao social, CNPJ, contato e endereco. Esses dados pertencem ao tenant e somente o proprietario global ou um administrador da propria empresa pode altera-los.

As importacoes de precos procuram primeiro o codigo do item e, na ausencia dele, usam a descricao normalizada e a unidade. Compras usam numero, origem e referencia externa para impedir repeticoes. Todas as consultas e gravacoes recebem `organizationId` no servidor.

Relacoes operacionais tambem usam chaves estrangeiras compostas por
`organization_id` e pelo identificador do registro. Quinze relacoes criticas
impedem que fornecedor, centro de custo, compra, item, rateio, parcela, nota
fiscal, sincronizacao, regra, solicitacao, participante ou historico seja ligado
a outra empresa mesmo por uma gravacao direta no banco.

## Sincronizacao com Google Sheets

Cada empresa possui no maximo uma configuracao ativa de Google Sheets. A credencial da conta de servico fica somente no ambiente do servidor; o banco guarda apenas o ID da planilha, os nomes das abas e o estado da ultima sincronizacao.

A conta de servico recebe somente acesso de leitura e a API solicita o escopo `spreadsheets.readonly`. Uma verificacao dedicada consulta apenas os metadados da planilha para comprovar credencial, compartilhamento e mapeamento das abas antes de qualquer previa. Essa verificacao nao cria lote nem grava dados operacionais.

A leitura usa as abas normalizadas de fornecedores, precos, itens e parcelas. Quando a aba `valores negociados` existe, o adaptador tambem incorpora o historico legado, elimina pedidos que ja aparecem nos itens normalizados e herda o centro de custo padrao do fornecedor. Registros historicos sem data permanecem visiveis como pendencia e nao recebem datas inventadas.

O mesmo fluxo aceita um arquivo `.xlsx` exportado da planilha. O upload possui limite de tamanho, valida o formato real, preserva os numeros das linhas e usa exatamente o mesmo parser, hash, previa e aplicacao da leitura pela API do Google. Isso permite homologar a migracao antes de disponibilizar uma conta de servico.

A conciliacao resolve primeiro centros de custo e fornecedores, depois precos e compras. Uma compra existente com o mesmo fornecedor e valor recebe somente a nota fiscal ausente. Ambiguidades permanecem para revisao; parcelas ausentes ou divergentes nao bloqueiam o registro principal.

Durante a transicao, o fluxo de dados e intencionalmente unidirecional: Google Sheets ou XLSX para previa, previa confirmada para PostgreSQL e PostgreSQL para relatorios. Nao existe sincronizacao automatica bidirecional, pois edicoes concorrentes criariam conflitos e dupla contagem. Depois da homologacao, o PostgreSQL passa a ser a fonte oficial.

## Documentos fiscais

XML fiscal passa por validacao de assinatura, bloqueio de DTD e entidades externas e parser estruturado atualizado. PDFs pesquisaveis usam a camada de texto; documentos digitalizados usam Tesseract.js com o modelo portugues de maior precisao empacotado como dependencia da API.

O modelo OCR e resolvido e validado na inicializacao, usa cache somente leitura e nao depende de download durante o processamento. O container confirma essa disponibilidade com a rede desativada antes do smoke test. A extracao permanece em revisao humana e nunca grava uma compra diretamente.

A integracao fiscal por empresa armazena CNPJ, ambiente, validade, fingerprint,
estado, `ultNSU`, `maxNSU`, erro e proxima tentativa. Certificado A1 e senha sao
entradas sem rota de download, criptografadas separadamente com AES-256-GCM. A
API valida formato, senha, validade e, quando presente no certificado, o CNPJ.
Substituicao e revogacao usam versao otimista para impedir sobrescrita por uma
tela desatualizada.

O worker usa trava consultiva por empresa, cursor de NSU, chave de acesso, hash
e restricoes unicas para repetir lotes sem duplicar documentos. `docZip` e
descompactado antes do parser. Certificado vencido interrompe novas consultas
sem apagar o cursor; espera adaptativa respeita indisponibilidade e retornos sem
novos documentos.

Uma NF-e somente recebe vinculo automatico quando existe uma correspondencia
unica e integral de tenant, CNPJ, referencia do pedido, itens, quantidades e
valores. Qualquer diferenca resulta em `REVIEW_REQUIRED`. O rollout possui os
modos `SHADOW`, `EXACT_MATCH` e `AUTO_SCIENCE`; eventos conclusivos de
manifestacao permanecem manuais em todos eles.

## Operacao de compras

A consulta detalhada de uma compra devolve itens, rateios, parcelas, observacoes e a referencia fiscal dentro do tenant ativo. A correcao substitui itens e parcelas em uma unica transacao, recalcula total e economia e preserva a origem e a referencia externa da importacao. Fornecedores ou centros de custo historicos que tenham sido inativados podem permanecer no registro existente, mas nao podem ser escolhidos para uma nova classificacao.

Toda edicao exige o `updatedAt` lido pelo usuario. Se outra operacao alterar a compra antes da gravacao, a API rejeita a versao antiga e exige recarregamento. Parcelas pagas permanecem no banco e nao podem ter valor, vencimento, ordem ou existencia alterados pela edicao da compra.

O Kanban usa `Cadastro`, `Solicitacao`, `Aguardando aprovacao`,
`Pedido de compra`, `Faturado pelo fornecedor`, `Recebido` e `Concluido`.
Compras manuais iniciam em cadastro; importacoes historicas iniciam como pedido
formalizado; uma nota fiscal importada inicia como faturada. Cada movimento gera
historico com autor, instante e motivo quando exigido.

Ao enviar uma compra para aprovacao, a API escolhe a regra ativa de maior valor
minimo aplicavel ao total. A regra admite quorum de uma ou duas pessoas. A
decisao ocorre em transacao serializavel; uma reprovacao exige comentario e
devolve a compra para solicitacao, enquanto o quorum concluido promove o pedido.
Edicoes ficam bloqueadas depois do envio e uma nota nao pode ser vinculada antes
da aprovacao.

O vinculo singular de nota permanece apenas como compatibilidade derivada. A
relacao oficial aceita varias NF-e por pedido. Recebimentos registram itens,
quantidades, responsavel, data, observacao e linha fiscal opcional. A quantidade
recebida nao pode exceder o saldo do pedido nem o saldo da linha fiscal. O pedido
so conclui quando estiver integralmente recebido, conciliado e sem saldo
financeiro, salvo encerramento excepcional auditado.

Cancelamento e reativacao exigem motivo, atualizam o estado sem apagar o
historico e geram evento de auditoria. O cancelamento tambem encerra uma
solicitacao pendente. Compras canceladas permanecem consultaveis por filtro e
nos relatorios de cancelamento, mas nao entram nos indicadores de compras
registradas.

## Notificacoes

Eventos de aprovacao, reprovacao e liberacao para o financeiro sao persistidos
em uma outbox na mesma transacao da operacao. Um worker separado reivindica as
mensagens, entrega por SMTP ou por templates da API oficial do WhatsApp,
registra sucesso ou falha e repete erros transitorios com espera exponencial.
Chaves de deduplicacao evitam reenvios do mesmo evento.

O modo `log` permite homologar sem provedor externo. Tokens, senhas SMTP e
identificadores da Meta existem somente no ambiente da API. O destino usado em
cada solicitacao fica congelado para auditoria, mas credenciais nunca sao
persistidas.

## Contas a pagar

A aprovacao da compra e o controle financeiro sao fluxos separados. Parcelas
evoluem como titulos auditaveis vinculaveis a NF-e e recebimento. O Kanban
financeiro usa `A conciliar`, `Aguardando aprovacao`, `Liberado para pagamento`,
`Parcialmente pago` e `Pago`; vencimento e um alerta calculado, nao uma coluna.

Cada empresa escolhe `DISABLED`, `PER_TITLE` ou `PER_PURCHASE_SNAPSHOT`. No modo
agrupado, a fotografia inclui somente os titulos conciliados e elegiveis que
existiam no pedido no instante da solicitacao. Titulos criados depois exigem uma
nova aprovacao. Regras financeiras por valor definem responsaveis e quorum de
uma ou duas pessoas sem reutilizar a regra de aprovacao da compra.

Instrucao de pagamento e congelada por versao na aprovacao. Mudanca posterior
cancela aprovacoes relacionadas e devolve o titulo para conferencia. Pix valida
tipo e chave, CPF/CNPJ, telefone, e-mail, UUID v4, BR Code EMV, CRC, moeda, pais,
valor e beneficiario verificavel. O fornecedor mantem nome e documento do
beneficiario como referencia para detectar divergencias.

Uma baixa e independente do titulo e exige valor, data, identificador bancario,
autor e comprovante privado. Varias baixas podem liquidar o mesmo titulo. O
saldo determina `PARTIALLY_PAID` ou `PAID`; a rota legada nao pode marcar pago
sem comprovante. Adiantamentos exigem justificativa, evidencia e aprovacao
extraordinaria.

A segregacao opcional impede que solicitante ou aprovador da compra aprove o
pagamento e que o aprovador financeiro registre a propria baixa. O sistema
continua sem acessar conta bancaria, guardar senha, executar Pix ou confirmar
pagamento automaticamente.

## Indicadores

O dashboard nao armazena totais derivados. Por padrao, a API agrega todo o historico de compras registradas e aceita filtros de periodo, fornecedor, centro de custo, categoria e inclusao de registros sem data. Quando um item possui rateio, somente os valores das alocacoes entram no grafico por departamento; o total direto do item nao e somado novamente. Compras sem data entram nos totais, categorias e departamentos, mas ficam fora da serie mensal ate a correcao da emissao.

Quando o filtro informa data inicial e final, os indicadores de valor comprado e economia comparam o resultado com o intervalo imediatamente anterior de mesma duracao, preservando os demais filtros. A API nao inventa percentual quando o periodo anterior possui base monetaria zero; nesse caso, a variacao permanece indisponivel.

## Relatorios

Os relatorios usam as compras como fonte unica e aplicam o `organizationId`
antes de qualquer filtro. A API consolida valores, economia, ticket medio e
contagens e devolve agrupamentos por fornecedor, categoria, departamento e mes.
Status operacional e etapa do workflow sao filtros independentes. Os valores
departamentais usam os montantes exatos dos rateios e mantem itens sem
classificacao visiveis.

As exportacoes CSV e XLSX repetem os filtros da consulta e neutralizam celulas
iniciadas por caracteres de formula. O CSV usa separador compativel com Excel em
`pt_BR`. O Excel resumido entrega indicadores, compras e agrupamentos por
departamento, fornecedor, categoria e mes. O Excel detalhado acrescenta itens,
consolidacao mensal de itens, rateios, parcelas, notas fiscais e dados
cadastrais dos fornecedores. Ambos identificam a etapa da compra. O Excel de
contas a pagar entrega resumo financeiro e titulos filtrados. Datas, quantidades
e valores monetarios permanecem tipados; nenhuma agregacao e calculada no
navegador.

## Interface

O produto usa a marca E-Gestao Compras e exibe o nome da empresa ativa no
cabecalho. Depois da autenticacao, um lancador central apresenta os modulos
Compras, Financeiro e Administracao permitidos ao usuario. Ao entrar em um
modulo, a barra lateral mostra somente as rotas daquele contexto e permite
voltar ao lancador para trocar de area.

Essa divisao e exclusivamente de navegacao: pedidos, documentos fiscais,
recebimentos e titulos financeiros continuam relacionados no mesmo tenant e na
mesma API. Os menus e comandos permanecem derivados da matriz compartilhada de
permissoes. A barra lateral pode ser recolhida e permanece funcional em telas
menores. As preferencias visuais oferecem os temas Normal, Escuro e Branco e
sao salvas apenas no navegador do usuario.

## Operacao e recuperacao

A API separa verificacoes de vida e prontidao. Fora do modo demonstrativo, a prontidao executa uma consulta minima no PostgreSQL. Toda resposta recebe `x-request-id`, e o log estruturado registra metodo, caminho sem parametros, status e duracao.

Backups usam o formato customizado do `pg_dump` sem expor a senha na linha de comando. A verificacao estrutural usa `pg_restore --list`; o CI restaura o arquivo em outro banco descartavel e compara migracoes, contagens, totais monetarios e RLS antes de apagar o ambiente de ensaio.

## Transicao do legado

O Apps Script atual permanece em producao. O adaptador de leitura da planilha ja esta disponivel com previa e conciliacao; a mudanca de fonte primaria para PostgreSQL sera feita somente apos homologacao e comparacao dos totais.
