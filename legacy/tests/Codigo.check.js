/**
 * HUMAN CLINIC — CONTROLE DE COMPRAS
 * Fase 1: backend da automação.
 *
 * Fluxo:
 * 1) O formulário chama salvarPedido(payload).
 * 2) O pedido recebe um número sequencial único.
 * 3) Cada item é gravado na aba "Itens do Pedido".
 * 4) O pedido é consolidado em "valores negociados".
 * 5) O gasto é rateado por Unidade + Centro de Custo.
 * 6) Parcelas e vencimentos são gravados em "Parcelas do Pedido".
 */

const CONFIG = Object.freeze({
  PREFIXO_PEDIDO: 'PED',
  FUSO_HORARIO: 'America/Sao_Paulo',
  PROPRIEDADE_SEQUENCIA: 'ULTIMO_NUMERO_PEDIDO',

  ABAS: {
    ITENS: 'Itens do Pedido',
    VALORES: 'valores negociados',
    RATEIO: 'Rateio por Centro de Custo',
    PARCELAS: 'Parcelas do Pedido',
    LISTAS: 'Listas',
    FORNECEDORES: 'Cadastro de Fornecedores',
    PRECOS: 'Tabela de Preços Negociados',
    REGRAS: 'Regras de Classificação',
    CONFERENCIA: 'Conferência da Nota Fiscal',
    LOG: 'Log de Importações'
  },

  CABECALHOS: {
    ITENS: [
      'Número do Pedido',
      'Data de Emissão da Nota Fiscal',
      'Unidade',
      'Comprador',
      'Fornecedor',
      'Categoria',
      'Descrição Geral da Compra',
      'Item',
      'Centro de Custo',
      'Quantidade',
      'Unidade de Medida',
      'Valor Unitário Inicial',
      'Valor Total Inicial',
      'Valor Unitário Negociado',
      'Valor Total Negociado',
      'Economia em R$',
      'Economia em %',
      'Natureza da Operação',
      'Método de Pagamento',
      'Número da Nota Fiscal',
      'Link da Nota Fiscal',
      'Documento da Solicitação',
      'Status'
    ],

    VALORES: [
      'Número do Pedido',
      'Unidade',
      'Comprador',
      'Prestador de Serviços',
      'Categoria',
      'Descrição da Compra',
      'Valor inicial',
      'Valor negociado',
      'R$ Economia',
      'Economia (%)',
      'Natureza da operação',
      'Método de pagamento',
      'Data de Emissão',
      'Documento',
      'Nota Fiscal'
    ],

    RATEIO: [
      'Número do Pedido',
      'Data de Emissão',
      'Ano',
      'Mês',
      'Unidade',
      'Centro de Custo',
      'Fornecedor',
      'Categoria',
      'Valor do Centro de Custo',
      'Total do Pedido',
      'Participação no Pedido (%)',
      'Participação no Gasto Geral (%)'
    ],

    PARCELAS: [
      'Número do Pedido',
      'Número da Nota Fiscal',
      'Parcela',
      'Data de Vencimento',
      'Valor da Parcela',
      'Método de Pagamento',
      'Status'
    ],

    LISTAS: [
      'Unidades',
      'Centros de Custo',
      'Unidades de Medida',
      'Métodos de Pagamento',
      'Status'
    ],

    FORNECEDORES: [
      'CNPJ do Fornecedor',
      'Razão Social',
      'Nome Comercial',
      'Categoria Padrão',
      'Natureza da Operação Padrão',
      'Método de Pagamento Padrão',
      'Centro de Custo Padrão',
      'Status',
      'Observações',
      'Atualizado em'
    ],

    PRECOS: [
      'Fornecedor',
      'CNPJ',
      'Item Padronizado',
      'Palavras-chave',
      'Unidade de Medida',
      'Valor Unitário Inicial',
      'Valor Unitário Negociado',
      'Categoria',
      'Centro de Custo',
      'Condição Negociada',
      'Vigência Inicial',
      'Vigência Final',
      'Status',
      'Observações'
    ],

    REGRAS: [
      'Palavra-chave',
      'Categoria Sugerida',
      'Centro de Custo Sugerido',
      'Prioridade',
      'Status',
      'Observações'
    ],

    CONFERENCIA: [
      'ID da Importação',
      'Data/Hora',
      'Arquivo',
      'Número da Nota',
      'CNPJ Fornecedor',
      'Fornecedor',
      'Data de Emissão',
      'Item Lido',
      'Item Padronizado',
      'Quantidade',
      'Unidade de Medida',
      'Valor Unitário',
      'Valor Total',
      'Categoria Sugerida',
      'Centro de Custo Sugerido',
      'Valor Negociado Encontrado',
      'Confiança',
      'Ação',
      'Status',
      'Observações'
    ],

    LOG: [
      'Data/Hora',
      'Usuário',
      'Arquivo',
      'Tipo de Arquivo',
      'Número da Nota',
      'CNPJ Fornecedor',
      'Fornecedor',
      'Status da Leitura',
      'Itens Lidos',
      'Itens Aprovados',
      'Observação Técnica',
      'Link do Arquivo'
    ]
  },

  STATUS: {
    CADASTRO: ['Ativo', 'Inativo', 'Revisar'],
    PRECO: ['Ativo', 'Vencido', 'Suspenso', 'Revisar'],
    PARCELA: ['Pendente', 'Pago', 'Vencido', 'Cancelado'],
    ACAO_CONFERENCIA: ['Aprovar', 'Editar', 'Ignorar', 'Revisar'],
    STATUS_CONFERENCIA: ['Pendente', 'Aprovado', 'Ignorado', 'Erro'],
    LOG: ['Recebido', 'Lido', 'Pendente de Conferência', 'Erro', 'Importado']
  }
});

/** Cria o menu dentro da planilha. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Compras Human Clinic')
    .addItem('Preparar estrutura', 'prepararEstrutura')
    .addItem('Abrir formulário', 'abrirFormulario')
    .addSeparator()
    .addItem('Atualizar relatórios dos novos pedidos', 'atualizarRelatoriosNovosPedidos')
    .addItem('Ressincronizar pedido', 'abrirRessincronizacaoPedido')
    .addSeparator()
    .addItem('Preparar fase 2A', 'prepararEstruturaFase2A')
    .addToUi();
}

/**
 * Prepara abas, cabeçalhos, listas, validações e formatações.
 * Não apaga dados existentes.
 */
function prepararEstrutura() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const itens = obterOuCriarAba_(ss, CONFIG.ABAS.ITENS);
  const valores = obterOuCriarAba_(ss, CONFIG.ABAS.VALORES);
  const rateio = obterOuCriarAba_(ss, CONFIG.ABAS.RATEIO);
  const parcelas = obterOuCriarAba_(ss, CONFIG.ABAS.PARCELAS);
  const listas = obterOuCriarAba_(ss, CONFIG.ABAS.LISTAS);

  aplicarCabecalhoSeVazio_(itens, CONFIG.CABECALHOS.ITENS);
  garantirCabecalhoComNumeroPedido_(valores, CONFIG.CABECALHOS.VALORES);
  aplicarCabecalhoSeVazio_(rateio, CONFIG.CABECALHOS.RATEIO);
  garantirCabecalhoParcelas_(parcelas);
  prepararListas_(listas);
  corrigirCentrosCustoLegados_(itens, rateio);
  normalizarPercentuaisRateio_(rateio);

  formatarAbaItens_(itens);
  formatarAbaValores_(valores);
  formatarAbaRateio_(rateio);
  formatarAbaParcelas_(parcelas);
  aplicarValidacoes_(itens, parcelas, listas);
  prepararAbasInteligencia_(ss);

  listas.hideSheet();
  ss.toast('Estrutura preparada sem apagar o histórico.', 'Compras Human Clinic', 5);
}

/** Prepara a base atual e as abas de inteligência da Fase 2A. */
function prepararEstruturaFase2A() {
  prepararEstrutura();
  SpreadsheetApp.getActiveSpreadsheet()
    .toast('Fase 2A preparada sem apagar o histórico.', 'Compras Human Clinic', 5);
}

/** Prompt simples para ressincronizar um pedido pelo menu. */
function abrirRessincronizacaoPedido() {
  const ui = SpreadsheetApp.getUi();
  const resposta = ui.prompt(
    'Ressincronizar pedido',
    'Digite o número do pedido, por exemplo PED-2026-0007:',
    ui.ButtonSet.OK_CANCEL
  );

  if (resposta.getSelectedButton() !== ui.Button.OK) return;

  const numeroPedido = resposta.getResponseText();
  const resultado = ressincronizarPedido(numeroPedido);

  ui.alert(
    'Ressincronização concluída',
    'Pedido: ' + resultado.numeroPedido + '\n' +
    'Total Itens: ' + formatarMoeda_(resultado.totalItens) + '\n' +
    'Total Resumo: ' + formatarMoeda_(resultado.totalResumo) + '\n' +
    'Total Parcelas: ' + formatarMoeda_(resultado.totalParcelas) + '\n' +
    'Resumo bate com itens: ' + (resultado.resumoBateComItens ? 'Sim' : 'Não') + '\n' +
    'Parcelas batem com itens: ' + (resultado.parcelasBatemComItens ? 'Sim' : 'Não'),
    ui.ButtonSet.OK
  );
}

/** Abre o formulário HTML quando o arquivo Formulario.html for incluído. */
function abrirFormulario() {
  const html = HtmlService.createHtmlOutputFromFile('Formulario')
    .setTitle('Novo pedido de compra');
  SpreadsheetApp.getUi().showSidebar(html);
}

/** Retorna listas para preencher os campos do formulário. */
function obterOpcoesFormulario() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const listas = obterOuCriarAba_(ss, CONFIG.ABAS.LISTAS);
  const fallback = opcoesFormularioPadrao_();

  try {
    prepararListas_(listas);
  } catch (erro) {
    return fallback;
  }

  try {
    prepararAbasInteligencia_(ss);
  } catch (erro) {
    // A tela de pedido nao deve ficar inutilizavel se uma aba auxiliar tiver problema.
  }

  const categorias = obterValoresUnicosDeColunas_(ss, [
    { aba: CONFIG.ABAS.VALORES, coluna: 5 },
    { aba: CONFIG.ABAS.ITENS, coluna: 6 }
  ]);

  const naturezasOperacao = obterValoresUnicosDeColunas_(ss, [
    { aba: CONFIG.ABAS.VALORES, coluna: 11 },
    { aba: CONFIG.ABAS.ITENS, coluna: 18 }
  ]);

  const metodos = lerColunaSemVazios_(listas, 4).map(function(valor) {
    if (normalizar_(valor) === normalizar_('Cartão')) return 'Cartão de crédito';
    if (normalizar_(valor) === normalizar_('Boleto')) return 'Boleto Bancário';
    return valor;
  });

  return {
    unidades: comFallback_(lerColunaSemVazios_(listas, 1), fallback.unidades),
    centrosCusto: comFallback_(lerColunaSemVazios_(listas, 2), fallback.centrosCusto),
    unidadesMedida: comFallback_(lerColunaSemVazios_(listas, 3), fallback.unidadesMedida),
    metodosPagamento: comFallback_(valoresUnicos_(metodos), fallback.metodosPagamento),
    status: comFallback_(lerColunaSemVazios_(listas, 5), fallback.status),
    categorias: comFallback_(categorias, fallback.categorias),
    naturezasOperacao: comFallback_(naturezasOperacao, fallback.naturezasOperacao),
    fornecedores: obterFornecedoresAtivosSeguro_(ss)
  };
}

function opcoesFormularioPadrao_() {
  return {
    unidades: ['Health', 'Matriz', 'Office'],
    centrosCusto: [
      'Recursos Humanos', 'Recepção', 'Financeiro', 'Limpeza', 'Farmácia',
      'Agendamento', 'Comercial', 'Experiência do Cliente', 'Diretoria',
      'Enfermagem', 'Escritório', 'Marketing', 'Tecnologia', 'Manutenção',
      'Café (Clientes)', 'Copa (Funcionários)', 'Consultórios', 'Outros'
    ],
    unidadesMedida: ['Unidade', 'Caixa', 'Pacote', 'Frasco', 'Ampola', 'Kit', 'Rolo', 'Serviço'],
    metodosPagamento: ['Boleto Bancário', 'PIX', 'Cartão de crédito', 'Transferência bancária', 'Débito automático'],
    status: ['Pendente', 'Finalizado', 'Cancelado'],
    categorias: [
      'Consumíveis de Tecnologia',
      'Medicamento/produto injetável',
      'Serviços de reparo/manutenção',
      'Serviços de transporte',
      'Descartáveis',
      'Consumo',
      'Papelaria/Escritório',
      'Materiais de reforma',
      'Materiais de Escritório',
      'Informática T.I'
    ],
    naturezasOperacao: [
      'Venda de mercadoria',
      'Remessa de bonificação',
      'Serviços farmacêuticos',
      'Venda de serviços'
    ],
    fornecedores: []
  };
}

function comFallback_(valores, fallback) {
  const lista = valoresUnicos_(valores || []);
  if (lista.length > 0) return lista;
  return fallback || [];
}

function obterFornecedoresAtivosSeguro_(ss) {
  try {
    return obterFornecedoresAtivos_(ss);
  } catch (erro) {
    return [];
  }
}

/**
 * Salva um pedido completo.
 *
 * Exemplo de payload:
 * {
 *   dataEmissao: '2026-07-05',
 *   unidade: 'Health',
 *   comprador: 'Pedro Henrique',
 *   fornecedor: 'Fornecedor X',
 *   categoria: 'Medicamentos',
 *   descricaoCompra: 'Reposição da farmácia',
 *   naturezaOperacao: 'Venda de mercadoria',
 *   metodoPagamento: 'Boleto',
 *   numeroNotaFiscal: '12345',
 *   linkNotaFiscal: 'https://...',
 *   documentoSolicitacao: 'https://...',
 *   status: 'Finalizado',
 *   itens: [{ descricao, centroCusto, quantidade, unidadeMedida,
 *             valorUnitarioInicial, valorUnitarioNegociado }],
 *   parcelas: [{ numero, vencimento, valor, status }]
 * }
 */
function salvarPedido(payload) {
  validarPayload_(payload);

  const lock = LockService.getDocumentLock();
  lock.waitLock(30000);

  try {
    prepararEstrutura();

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const numeroPedido = gerarNumeroPedido_();
    const dataEmissao = converterData_(payload.dataEmissao);

    const registrosItens = payload.itens.map(item => {
      const quantidade = numeroPositivo_(item.quantidade, 'Quantidade');
      const unitarioInicial = numeroNaoNegativo_(item.valorUnitarioInicial, 'Valor unitário inicial');
      const unitarioNegociado = numeroNaoNegativo_(item.valorUnitarioNegociado, 'Valor unitário negociado');

      const totalInicial = arredondarMoeda_(quantidade * unitarioInicial);
      const totalNegociado = arredondarMoeda_(quantidade * unitarioNegociado);
      const economia = arredondarMoeda_(totalInicial - totalNegociado);
      const economiaPercentual = totalInicial > 0 ? arredondarPercentual_(economia / totalInicial) : 0;

      return [
        numeroPedido,
        dataEmissao,
        textoObrigatorio_(payload.unidade, 'Unidade'),
        textoObrigatorio_(payload.comprador, 'Comprador'),
        textoObrigatorio_(payload.fornecedor, 'Fornecedor'),
        textoObrigatorio_(payload.categoria, 'Categoria'),
        textoObrigatorio_(payload.descricaoCompra, 'Descrição geral da compra'),
        textoObrigatorio_(item.descricao, 'Descrição do item'),
        textoObrigatorio_(item.centroCusto, 'Centro de custo'),
        quantidade,
        textoObrigatorio_(item.unidadeMedida, 'Unidade de medida'),
        unitarioInicial,
        totalInicial,
        unitarioNegociado,
        totalNegociado,
        economia,
        economiaPercentual,
        textoObrigatorio_(payload.naturezaOperacao, 'Natureza da operação'),
        textoObrigatorio_(payload.metodoPagamento, 'Método de pagamento'),
        textoOpcional_(payload.numeroNotaFiscal),
        textoOpcional_(payload.linkNotaFiscal),
        '',
        textoOpcional_(payload.status) || 'Finalizado'
      ];
    });

    const abaItens = ss.getSheetByName(CONFIG.ABAS.ITENS);
    const primeiraLinhaItens = gravarLinhas_(abaItens, registrosItens);
    aplicarLinksNotaFiscalItens_(abaItens, primeiraLinhaItens, registrosItens.length, payload.numeroNotaFiscal, payload.linkNotaFiscal);

    const resumo = consolidarPedido_(numeroPedido, dataEmissao, payload, registrosItens);
    gravarResumoValores_(ss, resumo);
    gravarRateioPedido_(ss, resumo, registrosItens);
    gravarParcelas_(ss, numeroPedido, payload);

    SpreadsheetApp.flush();

    return {
      sucesso: true,
      numeroPedido,
      quantidadeItens: registrosItens.length,
      valorInicial: resumo.valorInicial,
      valorNegociado: resumo.valorNegociado,
      economia: resumo.economia,
      economiaPercentual: resumo.economiaPercentual
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Atualiza somente os pedidos existentes em "Itens do Pedido" que ainda não
 * aparecem nos relatórios. Não apaga o histórico legado.
 */
function atualizarRelatoriosNovosPedidos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  prepararEstrutura();

  const abaItens = ss.getSheetByName(CONFIG.ABAS.ITENS);
  if (abaItens.getLastRow() < 2) return;

  const dados = abaItens.getRange(2, 1, abaItens.getLastRow() - 1, CONFIG.CABECALHOS.ITENS.length).getValues();
  const pedidos = agruparPor_(dados.filter(linha => linha[0]), linha => linha[0]);
  const pedidosExistentes = obterPedidosJaConsolidados_(ss);

  Object.keys(pedidos).forEach(numeroPedido => {
    if (pedidosExistentes.has(numeroPedido)) return;

    const linhas = pedidos[numeroPedido];
    const primeira = linhas[0];
    const payload = payloadAPartirDaLinha_(primeira);
    const resumo = consolidarPedido_(numeroPedido, primeira[1], payload, linhas);

    gravarResumoValores_(ss, resumo);
    gravarRateioPedido_(ss, resumo, linhas);
  });

  ss.toast('Novos pedidos consolidados.', 'Compras Human Clinic', 5);
}

function consolidarPedido_(numeroPedido, dataEmissao, payload, registrosItens) {
  const valorInicial = arredondarMoeda_(somarColuna_(registrosItens, 12));
  const valorNegociado = arredondarMoeda_(somarColuna_(registrosItens, 14));
  const economia = arredondarMoeda_(valorInicial - valorNegociado);

  return {
    numeroPedido,
    dataEmissao,
    unidade: payload.unidade,
    comprador: payload.comprador,
    fornecedor: payload.fornecedor,
    categoria: payload.categoria,
    descricaoCompra: payload.descricaoCompra,
    naturezaOperacao: payload.naturezaOperacao,
    metodoPagamento: payload.metodoPagamento,
    numeroNotaFiscal: payload.numeroNotaFiscal || '',
    linkNotaFiscal: payload.linkNotaFiscal || '',
    documentoSolicitacao: payload.documentoSolicitacao || '',
    valorInicial,
    valorNegociado,
    economia,
    economiaPercentual: valorInicial > 0 ? arredondarPercentual_(economia / valorInicial) : 0
  };
}

function gravarResumoValores_(ss, resumo) {
  const aba = ss.getSheetByName(CONFIG.ABAS.VALORES);
  const linha = [
    resumo.numeroPedido,
    resumo.unidade,
    resumo.comprador,
    resumo.fornecedor,
    resumo.categoria,
    resumo.descricaoCompra,
    resumo.valorInicial,
    resumo.valorNegociado,
    resumo.economia,
    resumo.economiaPercentual,
    resumo.naturezaOperacao,
    resumo.metodoPagamento,
    resumo.dataEmissao,
    resumo.documentoSolicitacao,
    resumo.linkNotaFiscal || resumo.numeroNotaFiscal
  ];

  const linhaDestino = gravarOuAtualizarPorPedido_(aba, resumo.numeroPedido, linha);
  aplicarLinkNotaFiscalResumo_(aba, linhaDestino, resumo.numeroNotaFiscal, resumo.linkNotaFiscal);
}

function gravarRateioPedido_(ss, resumo, registrosItens) {
  const aba = ss.getSheetByName(CONFIG.ABAS.RATEIO);
  removerLinhasDoPedido_(aba, resumo.numeroPedido);

  const agrupado = {};
  registrosItens.forEach(linha => {
    const unidade = String(linha[2]).trim();
    const centro = String(linha[8]).trim();
    const chave = `${unidade}|||${centro}`;
    agrupado[chave] = (agrupado[chave] || 0) + Number(linha[14] || 0);
  });

  const gastoGeral = obterGastoGeralItens_(ss);
  const ano = resumo.dataEmissao.getFullYear();
  const mes = Utilities.formatDate(resumo.dataEmissao, CONFIG.FUSO_HORARIO, 'MM/yyyy');

  const linhas = Object.entries(agrupado).map(([chave, valor]) => {
    const [unidade, centro] = chave.split('|||');
    const valorCentro = arredondarMoeda_(valor);

    return [
      resumo.numeroPedido,
      resumo.dataEmissao,
      ano,
      mes,
      unidade,
      centro,
      resumo.fornecedor,
      resumo.categoria,
      valorCentro,
      resumo.valorNegociado,
      resumo.valorNegociado > 0 ? formatarPercentualTexto_(valorCentro / resumo.valorNegociado) : '0,00%',
      gastoGeral > 0 ? formatarPercentualTexto_(valorCentro / gastoGeral) : '0,00%'
    ];
  });

  gravarLinhas_(aba, linhas);
}

function gravarParcelas_(ss, numeroPedido, payload) {
  if (ehPix_(payload.metodoPagamento)) return;
  if (!Array.isArray(payload.parcelas) || payload.parcelas.length === 0) return;

  const aba = ss.getSheetByName(CONFIG.ABAS.PARCELAS);
  const numeroNotaFiscal = textoOpcional_(payload.numeroNotaFiscal);
  removerParcelasDaNota_(aba, numeroPedido, numeroNotaFiscal);

  const cartaoCredito = ehCartaoCredito_(payload.metodoPagamento);
  const linhas = payload.parcelas.map(function(parcela, indice) {
    return [
      numeroPedido,
      numeroNotaFiscal,
      textoOpcional_(parcela.numero) || String(indice + 1),
      cartaoCredito || !parcela.vencimento ? '' : converterData_(parcela.vencimento),
      numeroNaoNegativo_(parcela.valor, 'Valor da parcela'),
      textoObrigatorio_(payload.metodoPagamento, 'Método de pagamento'),
      textoOpcional_(parcela.status) || 'Pendente'
    ];
  });

  gravarLinhas_(aba, linhas);
}
/**
 * Acrescenta ou atualiza parcelas de uma nota fiscal em um pedido existente.
 * As parcelas de outras notas fiscais do mesmo pedido são preservadas.
 */
function adicionarParcelasPedido(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Os dados das parcelas não foram enviados.');
  }

  const numeroPedido = textoObrigatorio_(payload.numeroPedido, 'Número do pedido');
  const numeroNotaFiscal = textoObrigatorio_(payload.numeroNotaFiscal, 'Número da nota fiscal');
  const metodoPagamento = textoObrigatorio_(payload.metodoPagamento, 'Método de pagamento');

  if (ehPix_(metodoPagamento)) {
    throw new Error('Compras via PIX não precisam de parcelas.');
  }

  if (!Array.isArray(payload.parcelas) || payload.parcelas.length === 0) {
    throw new Error('Inclua pelo menos uma parcela.');
  }

  prepararEstrutura();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName(CONFIG.ABAS.PARCELAS);

  removerParcelasDaNota_(aba, numeroPedido, numeroNotaFiscal);

  const cartaoCredito = ehCartaoCredito_(metodoPagamento);
  const linhas = payload.parcelas.map(function(parcela, indice) {
    if (!cartaoCredito && !parcela.vencimento) {
      throw new Error('Informe a data de vencimento da parcela ' + (indice + 1) + '.');
    }

    return [
      numeroPedido,
      numeroNotaFiscal,
      textoOpcional_(parcela.numero) || String(indice + 1),
      cartaoCredito || !parcela.vencimento ? '' : converterData_(parcela.vencimento),
      numeroNaoNegativo_(parcela.valor, 'Valor da parcela'),
      metodoPagamento,
      textoOpcional_(parcela.status) || 'Pendente'
    ];
  });

  gravarLinhas_(aba, linhas);
  SpreadsheetApp.flush();

  return {
    sucesso: true,
    numeroPedido: numeroPedido,
    numeroNotaFiscal: numeroNotaFiscal,
    quantidadeParcelas: linhas.length
  };
}
function gerarNumeroPedido_() {
  const props = PropertiesService.getDocumentProperties();
  const anoAtual = Number(Utilities.formatDate(new Date(), CONFIG.FUSO_HORARIO, 'yyyy'));
  const chaveAno = `${CONFIG.PROPRIEDADE_SEQUENCIA}_${anoAtual}`;

  let ultimo = Number(props.getProperty(chaveAno) || 0);

  if (ultimo === 0) {
    ultimo = localizarMaiorSequenciaDoAno_(anoAtual);
  }

  const proximo = ultimo + 1;
  props.setProperty(chaveAno, String(proximo));

  return `${CONFIG.PREFIXO_PEDIDO}-${anoAtual}-${String(proximo).padStart(4, '0')}`;
}

function localizarMaiorSequenciaDoAno_(ano) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName(CONFIG.ABAS.ITENS);
  if (!aba || aba.getLastRow() < 2) return 0;

  const numeros = aba.getRange(2, 1, aba.getLastRow() - 1, 1).getDisplayValues().flat();
  const regex = new RegExp(`^${CONFIG.PREFIXO_PEDIDO}-${ano}-(\\d+)$`);

  return numeros.reduce((maior, numero) => {
    const match = String(numero).trim().match(regex);
    return match ? Math.max(maior, Number(match[1])) : maior;
  }, 0);
}

function validarPayload_(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Os dados do pedido não foram enviados.');
  }

  [
    ['dataEmissao', 'Data de emissão'],
    ['unidade', 'Unidade'],
    ['comprador', 'Comprador'],
    ['fornecedor', 'Fornecedor'],
    ['categoria', 'Categoria'],
    ['descricaoCompra', 'Descrição geral da compra'],
    ['naturezaOperacao', 'Natureza da operação'],
    ['metodoPagamento', 'Método de pagamento']
  ].forEach(function(campoInfo) {
    textoObrigatorio_(payload[campoInfo[0]], campoInfo[1]);
  });

  if (!Array.isArray(payload.itens) || payload.itens.length === 0) {
    throw new Error('Inclua pelo menos um item no pedido.');
  }

  const pix = ehPix_(payload.metodoPagamento);
  const cartaoCredito = ehCartaoCredito_(payload.metodoPagamento);
  const parcelas = Array.isArray(payload.parcelas) ? payload.parcelas : [];

  if (!pix && parcelas.length === 0) {
    throw new Error('Inclua pelo menos uma parcela para este método de pagamento.');
  }

  parcelas.forEach(function(parcela, indice) {
    if (!cartaoCredito && !pix && !parcela.vencimento) {
      throw new Error('Informe a data de vencimento da parcela ' + (indice + 1) + '.');
    }
    numeroNaoNegativo_(parcela.valor, 'Valor da parcela');
  });

  if (!pix) {
    const totalParcelas = arredondarMoeda_(parcelas.reduce(function(soma, parcela) {
      return soma + Number(parcela.valor || 0);
    }, 0));

    const totalItens = arredondarMoeda_(payload.itens.reduce(function(soma, item) {
      return soma + Number(item.quantidade || 0) * Number(item.valorUnitarioNegociado || 0);
    }, 0));

    if (Math.abs(totalParcelas - totalItens) > 0.02) {
      throw new Error('A soma das parcelas (' + formatarMoeda_(totalParcelas) +
        ') deve ser igual ao valor negociado do pedido (' + formatarMoeda_(totalItens) + ').');
    }
  }
}

/**
 * Corrige o centro de custo legado "Café e Copa".
 * Como o teste informado era uma compra da 3 Corações, o legado é direcionado
 * para "Café (Clientes)". Compras destinadas aos funcionários devem usar
 * "Copa (Funcionários)" nos próximos lançamentos.
 */
function corrigirCentrosCustoLegados_(abaItens, abaRateio) {
  substituirTextoExatoNaColuna_(abaItens, 9, 'Café e Copa', 'Café (Clientes)');
  substituirTextoExatoNaColuna_(abaRateio, 6, 'Café e Copa', 'Café (Clientes)');
}

function substituirTextoExatoNaColuna_(aba, coluna, valorAntigo, valorNovo) {
  if (!aba || aba.getLastRow() < 2) return;

  const intervalo = aba.getRange(2, coluna, aba.getLastRow() - 1, 1);
  const valores = intervalo.getValues();
  let alterou = false;

  valores.forEach(function(linha) {
    if (normalizar_(linha[0]) === normalizar_(valorAntigo)) {
      linha[0] = valorNovo;
      alterou = true;
    }
  });

  if (alterou) intervalo.setValues(valores);
}

/**
 * Converte percentuais antigos gravados como número decimal em texto legível.
 * Exemplo: 1 vira 100,00% e 0,625 vira 62,50%.
 */
function normalizarPercentuaisRateio_(aba) {
  if (!aba || aba.getLastRow() < 2) return;

  [11, 12].forEach(function(coluna) {
    const intervalo = aba.getRange(2, coluna, aba.getLastRow() - 1, 1);
    const valores = intervalo.getValues();
    let alterou = false;

    valores.forEach(function(linha) {
      const valor = linha[0];

      if (typeof valor === 'number' && isFinite(valor)) {
        linha[0] = formatarPercentualTexto_(valor);
        alterou = true;
        return;
      }

      const texto = String(valor || '').trim();
      if (texto && texto.indexOf('%') === -1) {
        const numero = Number(texto.replace(',', '.'));
        if (isFinite(numero)) {
          linha[0] = formatarPercentualTexto_(numero);
          alterou = true;
        }
      }
    });

    if (alterou) intervalo.setValues(valores);
  });
}

function formatarPercentualTexto_(valorDecimal) {
  const percentual = Math.round((Number(valorDecimal) * 100 + Number.EPSILON) * 100) / 100;
  return percentual.toFixed(2).replace('.', ',') + '%';
}

function prepararListas_(aba) {
  aplicarCabecalhoSeVazio_(aba, CONFIG.CABECALHOS.LISTAS);

  const listasPadrao = {
    1: ['Health', 'Matriz', 'Office'],
    2: [
      'Recursos Humanos', 'Recepção', 'Financeiro', 'Limpeza', 'Farmácia',
      'Agendamento', 'Comercial', 'Experiência do Cliente', 'Diretoria',
      'Enfermagem', 'Escritório', 'Marketing', 'Tecnologia', 'Manutenção',
      'Café (Clientes)', 'Copa (Funcionários)', 'Consultórios', 'Outros'
    ],
    3: ['Unidade', 'Caixa', 'Pacote', 'Frasco', 'Ampola', 'Kit', 'Rolo', 'Serviço'],
    4: ['Boleto Bancário', 'PIX', 'Cartão de crédito', 'Transferência bancária', 'Débito automático'],
    5: ['Pendente', 'Finalizado', 'Cancelado']
  };

  Object.entries(listasPadrao).forEach(([coluna, valores]) => {
    const col = Number(coluna);
    if (aba.getLastRow() < 2 || lerColunaSemVazios_(aba, col).length === 0) {
      aba.getRange(2, col, valores.length, 1).setValues(valores.map(v => [v]));
    }
  });

  sincronizarValorLista_(aba, 2, 'Café', 'Café (Clientes)');
  sincronizarValorLista_(aba, 2, 'Copa para Funcionários', 'Copa (Funcionários)');
  sincronizarValorLista_(aba, 4, 'Boleto', 'Boleto Bancário');
  sincronizarValorLista_(aba, 4, 'Cartão', 'Cartão de crédito');
  garantirValorNaLista_(aba, 2, 'Café (Clientes)');
  garantirValorNaLista_(aba, 2, 'Copa (Funcionários)');
  garantirValorNaLista_(aba, 4, 'Boleto Bancário');
  garantirValorNaLista_(aba, 4, 'Cartão de crédito');

  aba.setFrozenRows(1);
  aba.autoResizeColumns(1, CONFIG.CABECALHOS.LISTAS.length);
}

function prepararAbasInteligencia_(ss) {
  const planos = [
    {
      nome: CONFIG.ABAS.FORNECEDORES,
      cabecalhos: CONFIG.CABECALHOS.FORNECEDORES,
      largura: 26,
      validacoes: [{ coluna: 8, valores: CONFIG.STATUS.CADASTRO }]
    },
    {
      nome: CONFIG.ABAS.PRECOS,
      cabecalhos: CONFIG.CABECALHOS.PRECOS,
      largura: 24,
      validacoes: [{ coluna: 13, valores: CONFIG.STATUS.PRECO }]
    },
    {
      nome: CONFIG.ABAS.REGRAS,
      cabecalhos: CONFIG.CABECALHOS.REGRAS,
      largura: 27,
      validacoes: [{ coluna: 5, valores: CONFIG.STATUS.CADASTRO }]
    },
    {
      nome: CONFIG.ABAS.CONFERENCIA,
      cabecalhos: CONFIG.CABECALHOS.CONFERENCIA,
      largura: 23,
      validacoes: [
        { coluna: 18, valores: CONFIG.STATUS.ACAO_CONFERENCIA },
        { coluna: 19, valores: CONFIG.STATUS.STATUS_CONFERENCIA }
      ]
    },
    {
      nome: CONFIG.ABAS.LOG,
      cabecalhos: CONFIG.CABECALHOS.LOG,
      largura: 24,
      validacoes: [{ coluna: 8, valores: CONFIG.STATUS.LOG }]
    }
  ];

  planos.forEach(function(plano) {
    const aba = obterOuCriarAba_(ss, plano.nome);
    aplicarCabecalhoCompleto_(aba, plano.cabecalhos);
    formatarCabecalho_(aba, plano.cabecalhos.length);
    aba.setFrozenRows(1);
    ajustarLarguras_(aba, plano.cabecalhos.map(function() { return plano.largura; }));
    aplicarFiltroSeguro_(aba, plano.cabecalhos.length);
    aplicarValidacoesLista_(aba, plano.validacoes || []);
  });
}

function aplicarCabecalhoCompleto_(aba, cabecalhos) {
  const atual = aba.getRange(1, 1, 1, cabecalhos.length).getDisplayValues()[0];
  const estaVazio = atual.every(function(valor) {
    return !String(valor || '').trim();
  });

  if (estaVazio) {
    aba.getRange(1, 1, 1, cabecalhos.length).setValues([cabecalhos]);
    return;
  }

  cabecalhos.forEach(function(cabecalho, indice) {
    const existente = String(atual[indice] || '').trim();
    if (!existente) aba.getRange(1, indice + 1).setValue(cabecalho);
  });
}

function aplicarFiltroSeguro_(aba, quantidadeColunas) {
  if (aba.getFilter()) return;

  try {
    aba.getRange(1, 1, Math.max(aba.getMaxRows(), 2), quantidadeColunas).createFilter();
  } catch (erro) {
    // Algumas abas com tabela nativa podem recusar filtro duplicado; nesse caso seguimos.
  }
}

function aplicarValidacoesLista_(aba, validacoes) {
  validacoes.forEach(function(config) {
    const regra = SpreadsheetApp.newDataValidation()
      .requireValueInList(config.valores, true)
      .setAllowInvalid(false)
      .build();

    aba.getRange(2, config.coluna, Math.max(aba.getMaxRows() - 1, 1), 1)
      .setDataValidation(regra);
  });
}

function obterFornecedoresAtivos_(ss) {
  const aba = ss.getSheetByName(CONFIG.ABAS.FORNECEDORES);
  if (!aba || aba.getLastRow() < 2) return [];

  return aba
    .getRange(2, 1, aba.getLastRow() - 1, CONFIG.CABECALHOS.FORNECEDORES.length)
    .getValues()
    .filter(function(linha) {
      const status = normalizar_(linha[7] || 'Ativo');
      return status === normalizar_('Ativo') || status === '';
    })
    .map(function(linha) {
      return {
        cnpj: linha[0],
        razaoSocial: linha[1],
        nomeComercial: linha[2],
        categoriaPadrao: linha[3],
        naturezaOperacaoPadrao: linha[4],
        metodoPagamentoPadrao: linha[5],
        centroCustoPadrao: linha[6],
        status: linha[7]
      };
    });
}

function buscarFornecedorFormulario(termo) {
  prepararEstrutura();
  return buscarFornecedorInteligente(termo);
}

function buscarFornecedorInteligente(termo) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  prepararAbasInteligencia_(ss);

  const busca = normalizar_(termo);
  const cnpjBusca = normalizarCnpj_(termo);
  if (!busca && !cnpjBusca) return null;

  const aba = ss.getSheetByName(CONFIG.ABAS.FORNECEDORES);
  if (!aba || aba.getLastRow() < 2) return null;

  const dados = aba.getRange(2, 1, aba.getLastRow() - 1, CONFIG.CABECALHOS.FORNECEDORES.length).getValues();
  const encontrado = dados.find(function(linha) {
    const status = normalizar_(linha[7] || 'Ativo');
    if (status && status !== normalizar_('Ativo')) return false;

    const cnpjConfere = cnpjBusca && normalizarCnpj_(linha[0]) === cnpjBusca;
    const razaoConfere = busca && normalizar_(linha[1]).indexOf(busca) !== -1;
    const nomeConfere = busca && normalizar_(linha[2]).indexOf(busca) !== -1;
    return cnpjConfere || razaoConfere || nomeConfere;
  });

  if (!encontrado) return null;

  return {
    cnpj: encontrado[0],
    razaoSocial: encontrado[1],
    nomeComercial: encontrado[2],
    categoriaPadrao: encontrado[3],
    naturezaOperacaoPadrao: encontrado[4],
    metodoPagamentoPadrao: encontrado[5],
    centroCustoPadrao: encontrado[6],
    status: encontrado[7]
  };
}

function sugerirItemFormulario(fornecedorOuCnpj, descricaoItem, dataReferencia) {
  prepararEstrutura();

  const fornecedor = buscarFornecedorInteligente(fornecedorOuCnpj);
  const preco = buscarPrecoNegociado(fornecedorOuCnpj, descricaoItem, dataReferencia);
  const regra = classificarItemPorRegras(descricaoItem);

  const sugestao = {
    fornecedor: fornecedor,
    preco: preco,
    regra: regra,
    itemPadronizado: '',
    categoria: '',
    centroCusto: '',
    unidadeMedida: '',
    valorUnitarioInicial: '',
    valorUnitarioNegociado: '',
    confianca: 0,
    origem: []
  };

  if (fornecedor) {
    sugestao.categoria = fornecedor.categoriaPadrao || sugestao.categoria;
    sugestao.centroCusto = fornecedor.centroCustoPadrao || sugestao.centroCusto;
    sugestao.origem.push('fornecedor');
    sugestao.confianca += 0.2;
  }

  if (regra) {
    sugestao.categoria = regra.categoriaSugerida || sugestao.categoria;
    sugestao.centroCusto = regra.centroCustoSugerido || sugestao.centroCusto;
    sugestao.origem.push('regra');
    sugestao.confianca += 0.3;
  }

  if (preco) {
    sugestao.itemPadronizado = preco.itemPadronizado || sugestao.itemPadronizado;
    sugestao.categoria = preco.categoria || sugestao.categoria;
    sugestao.centroCusto = preco.centroCusto || sugestao.centroCusto;
    sugestao.unidadeMedida = preco.unidadeMedida || sugestao.unidadeMedida;
    sugestao.valorUnitarioInicial = preco.valorUnitarioInicial;
    sugestao.valorUnitarioNegociado = preco.valorUnitarioNegociado;
    sugestao.origem.push('preço negociado');
    sugestao.confianca += 0.5;
  }

  sugestao.confianca = Math.min(1, arredondarPercentual_(sugestao.confianca));
  return sugestao;
}

function buscarPrecoNegociado(fornecedorOuCnpj, descricaoItem, dataReferencia) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  prepararAbasInteligencia_(ss);

  const fornecedorBusca = normalizar_(fornecedorOuCnpj);
  const cnpjBusca = normalizarCnpj_(fornecedorOuCnpj);
  const itemBusca = normalizar_(descricaoItem);
  const data = dataReferencia ? converterData_(dataReferencia) : new Date();

  if (!itemBusca) return null;

  const aba = ss.getSheetByName(CONFIG.ABAS.PRECOS);
  if (!aba || aba.getLastRow() < 2) return null;

  const dados = aba.getRange(2, 1, aba.getLastRow() - 1, CONFIG.CABECALHOS.PRECOS.length).getValues();
  const candidatos = dados.filter(function(linha) {
    const status = normalizar_(linha[12] || 'Ativo');
    if (status !== normalizar_('Ativo')) return false;

    const fornecedorOk =
      (fornecedorBusca && normalizar_(linha[0]).indexOf(fornecedorBusca) !== -1) ||
      (cnpjBusca && normalizarCnpj_(linha[1]) === cnpjBusca);

    if (!fornecedorOk) return false;
    if (!vigenciaValida_(linha[10], linha[11], data)) return false;

    const palavras = String(linha[3] || linha[2] || '')
      .split(',')
      .map(function(valor) { return normalizar_(valor); })
      .filter(Boolean);

    return palavras.some(function(palavra) {
      return itemBusca.indexOf(palavra) !== -1;
    });
  });

  if (candidatos.length === 0) return null;

  candidatos.sort(function(a, b) {
    return String(b[3] || '').length - String(a[3] || '').length;
  });

  const linha = candidatos[0];
  return {
    fornecedor: linha[0],
    cnpj: linha[1],
    itemPadronizado: linha[2],
    unidadeMedida: linha[4],
    valorUnitarioInicial: linha[5],
    valorUnitarioNegociado: linha[6],
    categoria: linha[7],
    centroCusto: linha[8],
    condicaoNegociada: linha[9],
    vigenciaInicial: linha[10],
    vigenciaFinal: linha[11]
  };
}

function classificarItemPorRegras(descricaoItem) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  prepararAbasInteligencia_(ss);

  const texto = normalizar_(descricaoItem);
  if (!texto) return null;

  const aba = ss.getSheetByName(CONFIG.ABAS.REGRAS);
  if (!aba || aba.getLastRow() < 2) return null;

  const dados = aba.getRange(2, 1, aba.getLastRow() - 1, CONFIG.CABECALHOS.REGRAS.length).getValues();
  const candidatos = dados.filter(function(linha) {
    const status = normalizar_(linha[4] || 'Ativo');
    const palavra = normalizar_(linha[0]);
    return palavra && status === normalizar_('Ativo') && texto.indexOf(palavra) !== -1;
  });

  if (candidatos.length === 0) return null;

  candidatos.sort(function(a, b) {
    return Number(a[3] || 999) - Number(b[3] || 999);
  });

  const linha = candidatos[0];
  return {
    palavraChave: linha[0],
    categoriaSugerida: linha[1],
    centroCustoSugerido: linha[2],
    prioridade: linha[3]
  };
}

function vigenciaValida_(inicio, fim, dataReferencia) {
  const data = dataReferencia || new Date();
  const dataInicio = inicio ? converterData_(inicio) : null;
  const dataFim = fim ? converterData_(fim) : null;

  if (dataInicio && data < dataInicio) return false;
  if (dataFim && data > dataFim) return false;
  return true;
}

function ressincronizarPedido(numeroPedido) {
  const pedido = textoObrigatorio_(numeroPedido, 'Número do pedido');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  prepararEstrutura();

  const abaItens = ss.getSheetByName(CONFIG.ABAS.ITENS);
  if (!abaItens || abaItens.getLastRow() < 2) {
    throw new Error('A aba Itens do Pedido está vazia.');
  }

  const linhas = abaItens
    .getRange(2, 1, abaItens.getLastRow() - 1, CONFIG.CABECALHOS.ITENS.length)
    .getValues()
    .filter(function(linha) {
      return String(linha[0]).trim() === pedido;
    });

  if (linhas.length === 0) {
    throw new Error('Pedido não encontrado na aba Itens do Pedido: ' + pedido);
  }

  const primeira = linhas[0];
  const payload = payloadAPartirDaLinha_(primeira);
  const resumo = consolidarPedido_(pedido, primeira[1], payload, linhas);

  gravarResumoValores_(ss, resumo);
  gravarRateioPedido_(ss, resumo, linhas);
  SpreadsheetApp.flush();

  return validarConsistenciaPedido(pedido);
}

function validarConsistenciaPedido(numeroPedido) {
  const pedido = textoObrigatorio_(numeroPedido, 'Número do pedido');
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const totalItens = somarPedidoNaAba_(ss.getSheetByName(CONFIG.ABAS.ITENS), pedido, 15);
  const totalResumo = valorResumoPedido_(ss.getSheetByName(CONFIG.ABAS.VALORES), pedido, 8);
  const totalParcelas = somarPedidoNaAba_(ss.getSheetByName(CONFIG.ABAS.PARCELAS), pedido, 5);

  return {
    numeroPedido: pedido,
    totalItens: arredondarMoeda_(totalItens),
    totalResumo: arredondarMoeda_(totalResumo),
    totalParcelas: arredondarMoeda_(totalParcelas),
    resumoBateComItens: Math.abs(totalItens - totalResumo) <= 0.02,
    parcelasBatemComItens: totalParcelas === 0 || Math.abs(totalItens - totalParcelas) <= 0.02
  };
}

function somarPedidoNaAba_(aba, numeroPedido, colunaUmBaseado) {
  if (!aba || aba.getLastRow() < 2) return 0;

  const dados = aba.getRange(2, 1, aba.getLastRow() - 1, Math.max(aba.getLastColumn(), colunaUmBaseado)).getValues();
  return dados.reduce(function(soma, linha) {
    if (String(linha[0]).trim() !== numeroPedido) return soma;
    return soma + Number(linha[colunaUmBaseado - 1] || 0);
  }, 0);
}

function valorResumoPedido_(aba, numeroPedido, colunaUmBaseado) {
  if (!aba || aba.getLastRow() < 2) return 0;

  const dados = aba.getRange(2, 1, aba.getLastRow() - 1, Math.max(aba.getLastColumn(), colunaUmBaseado)).getValues();
  const linha = dados.find(function(item) {
    return String(item[0]).trim() === numeroPedido;
  });

  return linha ? Number(linha[colunaUmBaseado - 1] || 0) : 0;
}

function aplicarValidacoes_(itens, parcelas, listas) {
  const maxLinhas = Math.max(itens.getMaxRows() - 1, 1);
  const regraUnidades = SpreadsheetApp.newDataValidation()
    .requireValueInRange(listas.getRange('A2:A'), true)
    .setAllowInvalid(false).build();
  const regraCentros = SpreadsheetApp.newDataValidation()
    .requireValueInRange(listas.getRange('B2:B'), true)
    .setAllowInvalid(false).build();
  const regraMedidas = SpreadsheetApp.newDataValidation()
    .requireValueInRange(listas.getRange('C2:C'), true)
    .setAllowInvalid(false).build();
  const regraPagamentos = SpreadsheetApp.newDataValidation()
    .requireValueInRange(listas.getRange('D2:D'), true)
    .setAllowInvalid(false).build();
  const regraStatus = SpreadsheetApp.newDataValidation()
    .requireValueInRange(listas.getRange('E2:E'), true)
    .setAllowInvalid(false).build();

  itens.getRange(2, 3, maxLinhas, 1).setDataValidation(regraUnidades);
  itens.getRange(2, 9, maxLinhas, 1).setDataValidation(regraCentros);
  itens.getRange(2, 11, maxLinhas, 1).setDataValidation(regraMedidas);
  itens.getRange(2, 19, maxLinhas, 1).setDataValidation(regraPagamentos);
  itens.getRange(2, 23, maxLinhas, 1).setDataValidation(regraStatus);

  parcelas.getRange(2, 6, Math.max(parcelas.getMaxRows() - 1, 1), 1).setDataValidation(regraPagamentos);
  parcelas.getRange(2, 7, Math.max(parcelas.getMaxRows() - 1, 1), 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(CONFIG.STATUS.PARCELA, true)
      .setAllowInvalid(false)
      .build()
  );
}

function obterValoresUnicosDeColunas_(ss, fontes) {
  const valores = [];

  fontes.forEach(function(fonte) {
    const aba = ss.getSheetByName(fonte.aba);
    if (!aba || aba.getLastRow() < 2) return;

    const encontrados = aba.getRange(2, fonte.coluna, aba.getLastRow() - 1, 1)
      .getDisplayValues()
      .flat()
      .map(function(valor) { return String(valor).trim(); })
      .filter(Boolean);

    encontrados.forEach(function(valor) { valores.push(valor); });
  });

  return valoresUnicos_(valores).sort(function(a, b) {
    return a.localeCompare(b, 'pt-BR');
  });
}

function valoresUnicos_(valores) {
  const vistos = {};
  return (valores || []).filter(function(valor) {
    const chave = normalizar_(valor);
    if (!chave || vistos[chave]) return false;
    vistos[chave] = true;
    return true;
  });
}

function garantirValorNaLista_(aba, coluna, valor) {
  const existentes = lerColunaSemVazios_(aba, coluna);
  const jaExiste = existentes.some(function(item) {
    return normalizar_(item) === normalizar_(valor);
  });

  if (!jaExiste) {
    const linha = Math.max(aba.getLastRow() + 1, 2);
    aba.getRange(linha, coluna).setValue(valor);
  }
}

function ehPix_(metodoPagamento) {
  return normalizar_(metodoPagamento) === normalizar_('PIX');
}

function ehCartaoCredito_(metodoPagamento) {
  const metodo = normalizar_(metodoPagamento);
  return metodo === normalizar_('Cartão de crédito') || metodo === normalizar_('Cartão');
}

function aplicarFormatoSeguro_(aba, intervalo, formato) {
  // As abas usam Tabelas do Google Sheets com colunas tipadas.
  // O Apps Script não pode alterar o formato numérico dessas colunas.
  // A formatação deve ser controlada pelo próprio tipo da coluna na planilha.
  return;
}

function formatarAbaItens_(aba) {
  formatarCabecalho_(aba, CONFIG.CABECALHOS.ITENS.length);
  aba.setFrozenRows(1);
  aplicarFormatoSeguro_(aba, 'B2:B', 'dd/mm/yyyy');
  aplicarFormatoSeguro_(aba, 'J2:J', '0.00');
  aplicarFormatoSeguro_(aba, 'L2:P', 'R$ #,##0.00');
  aplicarFormatoSeguro_(aba, 'Q2:Q', '0.00%');
  ajustarLarguras_(aba, [18, 16, 14, 18, 28, 22, 32, 32, 24, 12, 18, 18, 18, 22, 22, 18, 16, 24, 20, 20, 28, 28, 16]);
}

function formatarAbaValores_(aba) {
  formatarCabecalho_(aba, CONFIG.CABECALHOS.VALORES.length);
  aba.setFrozenRows(1);
  aplicarFormatoSeguro_(aba, 'G2:I', 'R$ #,##0.00');
  aplicarFormatoSeguro_(aba, 'J2:J', '0.00%');
  aplicarFormatoSeguro_(aba, 'M2:M', 'dd/mm/yyyy');
}

function formatarAbaRateio_(aba) {
  formatarCabecalho_(aba, CONFIG.CABECALHOS.RATEIO.length);
  aba.setFrozenRows(1);
  aplicarFormatoSeguro_(aba, 'B2:B', 'dd/mm/yyyy');
  aplicarFormatoSeguro_(aba, 'I2:J', 'R$ #,##0.00');
  aplicarFormatoSeguro_(aba, 'K2:L', '0.00%');
  ajustarLarguras_(aba, [18, 16, 10, 12, 16, 25, 28, 22, 22, 20, 24, 27]);
}

function formatarAbaParcelas_(aba) {
  formatarCabecalho_(aba, CONFIG.CABECALHOS.PARCELAS.length);
  aba.setFrozenRows(1);
  aplicarFormatoSeguro_(aba, 'D2:D', 'dd/mm/yyyy');
  aplicarFormatoSeguro_(aba, 'E2:E', 'R$ #,##0.00');
  ajustarLarguras_(aba, [18, 22, 12, 18, 18, 22, 16]);
}

function garantirCabecalhoParcelas_(aba) {
  const cabecalhos = CONFIG.CABECALHOS.PARCELAS;
  const primeiraLinha = aba.getRange(1, 1, 1, Math.max(aba.getLastColumn(), cabecalhos.length)).getDisplayValues()[0];
  const estaVazio = primeiraLinha.every(function(valor) { return !String(valor).trim(); });

  if (estaVazio) {
    aba.getRange(1, 1, 1, cabecalhos.length).setValues([cabecalhos]);
    return;
  }

  const segundoCabecalho = normalizar_(primeiraLinha[1]);
  if (segundoCabecalho !== normalizar_('Número da Nota Fiscal')) {
    aba.insertColumnAfter(1);
  }
  aba.getRange(1, 1, 1, cabecalhos.length).setValues([cabecalhos]);
}

function aplicarCabecalhoSeVazio_(aba, cabecalhos) {
  const atual = aba.getRange(1, 1, 1, cabecalhos.length).getDisplayValues()[0];
  const estaVazio = atual.every(valor => !String(valor).trim());
  if (estaVazio) aba.getRange(1, 1, 1, cabecalhos.length).setValues([cabecalhos]);
}

function garantirCabecalhoComNumeroPedido_(aba, cabecalhos) {
  const primeiraCelula = String(aba.getRange(1, 1).getDisplayValue()).trim();

  if (!primeiraCelula) {
    aba.getRange(1, 1, 1, cabecalhos.length).setValues([cabecalhos]);
    return;
  }

  if (normalizar_(primeiraCelula) !== normalizar_('Número do Pedido')) {
    aba.insertColumnBefore(1);
    aba.getRange(1, 1).setValue('Número do Pedido');
  }
}

function obterOuCriarAba_(ss, nome) {
  const existente = ss.getSheets().find(aba => normalizar_(aba.getName()) === normalizar_(nome));
  if (existente) {
    if (existente.getName() !== nome) existente.setName(nome);
    return existente;
  }
  return ss.insertSheet(nome);
}

function formatarCabecalho_(aba, quantidadeColunas) {
  aba.getRange(1, 1, 1, quantidadeColunas)
    .setFontWeight('bold')
    .setBackground('#9b3642')
    .setFontColor('#FFFFFF')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrap(true);
  aba.setRowHeight(1, 38);
}

function ajustarLarguras_(aba, larguras) {
  larguras.forEach((largura, indice) => aba.setColumnWidth(indice + 1, largura * 7));
}

function gravarLinhas_(aba, linhas) {
  if (!linhas || linhas.length === 0) return 0;
  const primeiraLinha = aba.getLastRow() + 1;
  aba.getRange(primeiraLinha, 1, linhas.length, linhas[0].length).setValues(linhas);
  return primeiraLinha;
}

function gravarOuAtualizarPorPedido_(aba, numeroPedido, linha) {
  const linhaExistente = localizarLinhaPedido_(aba, numeroPedido);
  const destino = linhaExistente || aba.getLastRow() + 1;
  aba.getRange(destino, 1, 1, linha.length).setValues([linha]);
  return destino;
}

function localizarLinhaPedido_(aba, numeroPedido) {
  if (aba.getLastRow() < 2) return 0;
  const numeros = aba.getRange(2, 1, aba.getLastRow() - 1, 1).getDisplayValues().flat();
  const indice = numeros.findIndex(numero => String(numero).trim() === numeroPedido);
  return indice === -1 ? 0 : indice + 2;
}

function removerLinhasDoPedido_(aba, numeroPedido) {
  if (!aba || aba.getLastRow() < 2) return;

  const pedidoAlvo = String(numeroPedido || '').trim();
  const valores = aba.getRange(2, 1, aba.getLastRow() - 1, 1).getDisplayValues().flat();

  for (let indice = valores.length - 1; indice >= 0; indice--) {
    if (String(valores[indice] || '').trim() === pedidoAlvo) {
      aba.deleteRow(indice + 2);
    }
  }
}

function removerParcelasDaNota_(aba, numeroPedido, numeroNotaFiscal) {
  if (!aba || aba.getLastRow() < 2) return;

  const pedidoAlvo = String(numeroPedido).trim();
  const notaAlvo = String(numeroNotaFiscal || '').trim();
  const dados = aba.getRange(2, 1, aba.getLastRow() - 1, 2).getDisplayValues();

  for (let indice = dados.length - 1; indice >= 0; indice--) {
    const linha = dados[indice];
    const mesmoPedido = String(linha[0]).trim() === pedidoAlvo;
    const mesmaNota = String(linha[1] || '').trim() === notaAlvo;
    if (mesmoPedido && mesmaNota) aba.deleteRow(indice + 2);
  }
}

function obterPedidosJaConsolidados_(ss) {
  const aba = ss.getSheetByName(CONFIG.ABAS.VALORES);
  if (!aba || aba.getLastRow() < 2) return new Set();
  return new Set(aba.getRange(2, 1, aba.getLastRow() - 1, 1).getDisplayValues().flat().filter(Boolean));
}

function obterGastoGeralItens_(ss) {
  const aba = ss.getSheetByName(CONFIG.ABAS.ITENS);
  if (!aba || aba.getLastRow() < 2) return 0;
  return aba.getRange(2, 15, aba.getLastRow() - 1, 1).getValues().flat()
    .reduce((soma, valor) => soma + Number(valor || 0), 0);
}

function payloadAPartirDaLinha_(linha) {
  return {
    unidade: linha[2],
    comprador: linha[3],
    fornecedor: linha[4],
    categoria: linha[5],
    descricaoCompra: linha[6],
    naturezaOperacao: linha[17],
    metodoPagamento: linha[18],
    numeroNotaFiscal: linha[19],
    linkNotaFiscal: linha[20],
    documentoSolicitacao: linha[21]
  };
}

function lerColunaSemVazios_(aba, coluna) {
  const ultimaLinha = Math.max(aba.getLastRow(), 2);
  return aba.getRange(2, coluna, ultimaLinha - 1, 1).getDisplayValues().flat()
    .map(valor => String(valor).trim())
    .filter(Boolean);
}

function agruparPor_(lista, obterChave) {
  return lista.reduce(function(grupos, item) {
    const chave = obterChave(item);
    if (!grupos[chave]) {
      grupos[chave] = [];
    }
    grupos[chave].push(item);
    return grupos;
  }, {});
}

function somarColuna_(linhas, indice) {
  return linhas.reduce((soma, linha) => soma + Number(linha[indice] || 0), 0);
}

function converterData_(valor) {
  if (valor instanceof Date && !isNaN(valor.getTime())) return valor;
  if (!valor) throw new Error('Informe uma data válida.');

  const texto = String(valor).trim();
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const br = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  let data;
  if (iso) data = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  else if (br) data = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
  else data = new Date(texto);

  if (isNaN(data.getTime())) throw new Error(`Data inválida: ${valor}`);
  return data;
}

function textoObrigatorio_(valor, nomeCampo) {
  const texto = String(valor == null ? '' : valor).trim();
  if (!texto) throw new Error(`Preencha o campo: ${nomeCampo}.`);
  return texto;
}

function textoOpcional_(valor) {
  return String(valor == null ? '' : valor).trim();
}

function numeroPositivo_(valor, nomeCampo) {
  const numero = Number(String(valor).replace(',', '.'));
  if (!Number.isFinite(numero) || numero <= 0) throw new Error(`${nomeCampo} deve ser maior que zero.`);
  return numero;
}

function numeroNaoNegativo_(valor, nomeCampo) {
  const numero = Number(String(valor).replace(',', '.'));
  if (!Number.isFinite(numero) || numero < 0) throw new Error(`${nomeCampo} deve ser igual ou maior que zero.`);
  return numero;
}

function arredondarMoeda_(valor) {
  return Math.round((Number(valor) + Number.EPSILON) * 100) / 100;
}

function formatarMoeda_(valor) {
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function sincronizarValorLista_(aba, coluna, valorAntigo, valorNovo) {
  const ultimaLinha = Math.max(aba.getLastRow(), 2);
  const intervalo = aba.getRange(2, coluna, ultimaLinha - 1, 1);
  const valores = intervalo.getValues();
  let alterado = false;

  valores.forEach(function(linha) {
    if (normalizar_(linha[0]) === normalizar_(valorAntigo)) {
      linha[0] = valorNovo;
      alterado = true;
    }
  });

  if (alterado) intervalo.setValues(valores);
}

function arredondarPercentual_(valor) {
  return Math.round(Number(valor || 0) * 10000) / 10000;
}

function criarLinkVisualNotaFiscal_(numeroNotaFiscal, linkNotaFiscal) {
  const numero = textoOpcional_(numeroNotaFiscal);
  const link = textoOpcional_(linkNotaFiscal);
  const texto = numero ? 'NF ' + numero : 'Nota Fiscal';

  if (!link) return SpreadsheetApp.newRichTextValue().setText(numero || '').build();

  return SpreadsheetApp.newRichTextValue()
    .setText(texto)
    .setLinkUrl(link)
    .build();
}

function aplicarLinksNotaFiscalItens_(aba, primeiraLinha, quantidadeLinhas, numeroNotaFiscal, linkNotaFiscal) {
  if (!primeiraLinha || quantidadeLinhas <= 0) return;
  const richText = criarLinkVisualNotaFiscal_(numeroNotaFiscal, linkNotaFiscal);
  const valores = Array.from({ length: quantidadeLinhas }, function() { return [richText]; });
  aba.getRange(primeiraLinha, 21, quantidadeLinhas, 1).setRichTextValues(valores);
}

function aplicarLinkNotaFiscalResumo_(aba, linha, numeroNotaFiscal, linkNotaFiscal) {
  if (!linha) return;
  aba.getRange(linha, 15).setRichTextValue(criarLinkVisualNotaFiscal_(numeroNotaFiscal, linkNotaFiscal));
}

function normalizar_(texto) {
  return String(texto || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function normalizarCnpj_(valor) {
  return String(valor || '').replace(/\D/g, '');
}
