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
  PLANILHA_ID: '1_JXod5CixgaBSPBvlsn1PhZ2_tNXPSkuB7lSQ3oEPf4',
  PREFIXO_PEDIDO: 'PED',
  FUSO_HORARIO: 'America/Sao_Paulo',
  PROPRIEDADE_SEQUENCIA: 'ULTIMO_NUMERO_PEDIDO',

  OPENAI: {
    PROPRIEDADE_CHAVE: 'OPENAI_API_KEY',
    PROPRIEDADE_MODELO: 'OPENAI_PDF_MODEL',
    MODELO_PADRAO: 'gpt-5.6',
    TAMANHO_MAXIMO_PDF_BYTES: 15 * 1024 * 1024,
    MAXIMO_ITENS: 100
  },

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
      'ID do Fornecedor',
      'CNPJ do Fornecedor',
      'Razão Social',
      'Nome Comercial',
      'Contato',
      'Telefone',
      'E-mail',
      'Categoria Padrão',
      'Natureza da Operação Padrão',
      'Método de Pagamento Padrão',
      'Centro de Custo Padrão',
      'Status',
      'Observações',
      'Atualizado em',
      'Atualizado por'
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
      'Observações',
      'Tipo de Acordo',
      'ID do Fornecedor',
      'ID do Preço',
      'Atualizado em',
      'Atualizado por'
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
  },

  TIPOS_ACORDO: ['Produto', 'Serviço', 'Contrato']
});

/** Cria o menu dentro da planilha. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Compras Human Clinic')
    .addItem('Preparar estrutura', 'prepararEstrutura')
    .addItem('Abrir formulário', 'abrirFormulario')
    .addItem('Abrir portal externo', 'abrirPortalExterno')
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

/** Entrega a aplicação web quando o projeto é publicado como Web App. */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('Portal')
    .setTitle('Human Clinic | Compras')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Abre um atalho para a implantação atual do portal. */
function abrirPortalExterno() {
  const url = ScriptApp.getService().getUrl();
  if (!url) {
    SpreadsheetApp.getUi().alert(
      'Portal ainda não publicado',
      'Publique o projeto como aplicativo da web para gerar o link externo.',
      SpreadsheetApp.getUi().ButtonSet.OK
    );
    return;
  }

  const html = HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;padding:20px">' +
    '<p>O portal está pronto para abrir.</p>' +
    '<a href="' + url + '" target="_blank" rel="noopener" ' +
    'style="display:inline-block;padding:10px 16px;background:#9b3642;color:#fff;text-decoration:none;border-radius:6px">' +
    'Abrir portal</a></div>'
  ).setWidth(340).setHeight(150);

  SpreadsheetApp.getUi().showModalDialog(html, 'Portal Human Clinic');
}

/** Retorna listas para preencher os campos do formulário. */
function obterOpcoesFormulario() {
  const fallback = opcoesFormularioPadrao_();

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const listas = ss.getSheetByName(CONFIG.ABAS.LISTAS);

    // Abrir o formulário deve ser uma operação somente de leitura e rápida.
    // A criação e a formatação das abas ficam em prepararEstrutura().
    const categorias = obterValoresUnicosDeColunas_(ss, [
      { aba: CONFIG.ABAS.VALORES, coluna: 5 },
      { aba: CONFIG.ABAS.ITENS, coluna: 6 }
    ]);

    const naturezasOperacao = obterValoresUnicosDeColunas_(ss, [
      { aba: CONFIG.ABAS.VALORES, coluna: 11 },
      { aba: CONFIG.ABAS.ITENS, coluna: 18 }
    ]);

    const metodos = listas ? lerColunaSemVazios_(listas, 4).map(function(valor) {
      if (normalizar_(valor) === normalizar_('Cartão')) return 'Cartão de crédito';
      if (normalizar_(valor) === normalizar_('Boleto')) return 'Boleto Bancário';
      return valor;
    }) : [];

    return {
      unidades: comFallback_(listas ? lerColunaSemVazios_(listas, 1) : [], fallback.unidades),
      centrosCusto: comFallback_(listas ? lerColunaSemVazios_(listas, 2) : [], fallback.centrosCusto),
      unidadesMedida: comFallback_(listas ? lerColunaSemVazios_(listas, 3) : [], fallback.unidadesMedida),
      metodosPagamento: comFallback_(valoresUnicos_(metodos), fallback.metodosPagamento),
      status: comFallback_(listas ? lerColunaSemVazios_(listas, 5) : [], fallback.status),
      categorias: comFallback_(categorias, fallback.categorias),
      naturezasOperacao: comFallback_(naturezasOperacao, fallback.naturezasOperacao),
      fornecedores: obterFornecedoresAtivosSeguro_(ss)
    };
  } catch (erro) {
    console.error('Falha ao carregar opções do formulário: ' + erro.message);
    return fallback;
  }
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
    unidadesMedida: [
      'Unidade', 'Caixa', 'Pacote', 'Frasco', 'Ampola', 'Kit', 'Rolo',
      'Serviço', 'Mês', 'Ano', 'Hora', 'Diária'
    ],
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

/** Carrega os dados iniciais do portal externo em uma unica chamada. */
function obterDadosPortal() {
  const ss = obterPlanilhaPortal_();
  const fornecedores = listarFornecedoresPortal_({}, ss);
  const precos = listarPrecosPortal_({}, ss, fornecedores);

  return {
    usuario: obterUsuarioAtual_(),
    opcoes: obterOpcoesCadastroFornecedor_(ss),
    fornecedores: fornecedores,
    precos: precos,
    dashboard: obterDadosDashboardPortal_(ss),
    resumo: resumirFornecedores_(fornecedores),
    resumoPrecos: resumirPrecos_(precos),
    atualizadoEm: Utilities.formatDate(new Date(), CONFIG.FUSO_HORARIO, 'dd/MM/yyyy HH:mm')
  };
}

/** Entrega a base analitica do portal sem duplicar valores entre abas. */
function obterDadosDashboardPortal_(ss) {
  const abaValores = ss.getSheetByName(CONFIG.ABAS.VALORES);
  const abaRateio = ss.getSheetByName(CONFIG.ABAS.RATEIO);
  const limiteLinhas = 5000;
  const registros = [];
  const rateios = [];
  let linhasSemData = 0;
  let linhasSemFornecedor = 0;
  let limitado = false;

  if (abaValores && abaValores.getLastRow() >= 2) {
    const quantidadeDisponivel = abaValores.getLastRow() - 1;
    const quantidade = Math.min(quantidadeDisponivel, limiteLinhas);
    limitado = quantidadeDisponivel > limiteLinhas;
    const primeiraLinha = quantidadeDisponivel > limiteLinhas
      ? abaValores.getLastRow() - quantidade + 1
      : 2;
    const dados = abaValores.getRange(primeiraLinha, 1, quantidade, 15).getValues();

    dados.forEach(function(linha) {
      const pedido = textoOpcional_(linha[0]);
      const fornecedor = textoOpcional_(linha[3]);
      const data = dataValidaOpcional_(linha[12]);
      const valorInicial = numeroDashboard_(linha[6]);
      const valorNegociado = numeroDashboard_(linha[7]);
      const economiaInformada = numeroDashboardOpcional_(linha[8]);
      const economia = economiaInformada == null
        ? arredondarMoeda_(valorInicial - valorNegociado)
        : economiaInformada;

      if (!data) linhasSemData += 1;
      if (!fornecedor) linhasSemFornecedor += 1;
      if (!pedido && !fornecedor && !valorInicial && !valorNegociado) return;

      registros.push({
        pedido: pedido,
        data: data ? Utilities.formatDate(data, CONFIG.FUSO_HORARIO, 'yyyy-MM-dd') : '',
        dataFormatada: data ? Utilities.formatDate(data, CONFIG.FUSO_HORARIO, 'dd/MM/yyyy') : '',
        competencia: data ? Utilities.formatDate(data, CONFIG.FUSO_HORARIO, 'yyyy-MM') : 'Sem data',
        unidade: textoOpcional_(linha[1]) || 'Nao informada',
        fornecedor: fornecedor || 'Nao informado',
        categoria: textoOpcional_(linha[4]) || 'Nao definida',
        descricao: textoOpcional_(linha[5]),
        valorInicial: valorInicial,
        valorNegociado: valorNegociado,
        economia: economia,
        naturezaOperacao: textoOpcional_(linha[10]),
        metodoPagamento: textoOpcional_(linha[11])
      });
    });
  }

  if (abaRateio && abaRateio.getLastRow() >= 2) {
    const quantidade = Math.min(abaRateio.getLastRow() - 1, limiteLinhas);
    const primeiraLinha = abaRateio.getLastRow() - quantidade + 1;
    abaRateio.getRange(primeiraLinha, 1, quantidade, 12).getValues().forEach(function(linha) {
      const valor = numeroDashboard_(linha[8]);
      if (!textoOpcional_(linha[0]) && !textoOpcional_(linha[5]) && !valor) return;
      rateios.push({
        pedido: textoOpcional_(linha[0]),
        data: formatarDataIsoPortal_(linha[1]),
        unidade: textoOpcional_(linha[4]) || 'Nao informada',
        centroCusto: textoOpcional_(linha[5]) || 'Nao definido',
        fornecedor: textoOpcional_(linha[6]) || 'Nao informado',
        categoria: textoOpcional_(linha[7]) || 'Nao definida',
        valor: valor
      });
    });
  }

  const datas = registros.map(function(item) { return item.data; }).filter(Boolean).sort();
  return {
    registros: registros,
    rateios: rateios,
    qualidade: {
      fontePrincipal: CONFIG.ABAS.VALORES,
      fonteRateio: CONFIG.ABAS.RATEIO,
      quantidadeRegistros: registros.length,
      quantidadeRateios: rateios.length,
      linhasSemData: linhasSemData,
      linhasSemFornecedor: linhasSemFornecedor,
      limitadoAosUltimos5000: limitado,
      primeiraData: datas.length ? datas[0] : '',
      ultimaData: datas.length ? datas[datas.length - 1] : ''
    }
  };
}

function numeroDashboard_(valor) {
  const numero = Number(valor);
  return isFinite(numero) ? arredondarMoeda_(numero) : 0;
}

function numeroDashboardOpcional_(valor) {
  if (valor === '' || valor == null) return null;
  const numero = Number(valor);
  return isFinite(numero) ? arredondarMoeda_(numero) : null;
}

/** Migra fornecedores historicos ausentes sem duplicar nomes ja cadastrados. */
function sincronizarFornecedoresHistoricosPortal() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const ss = obterPlanilhaPortal_();
    const resultado = sincronizarFornecedoresHistoricos_(ss);
    SpreadsheetApp.flush();
    return resultado;
  } finally {
    lock.releaseLock();
  }
}

function sincronizarFornecedoresHistoricos_(ss) {
  const abaCadastro = ss.getSheetByName(CONFIG.ABAS.FORNECEDORES);
  if (!abaCadastro) throw new Error('A aba Cadastro de Fornecedores nao foi encontrada.');
  garantirEstruturaFornecedoresPortal_(abaCadastro);

  const colunas = CONFIG.CABECALHOS.FORNECEDORES.length;
  const quantidadeCadastro = Math.max(abaCadastro.getLastRow() - 1, 0);
  const cadastrados = quantidadeCadastro
    ? abaCadastro.getRange(2, 1, quantidadeCadastro, colunas).getValues()
    : [];
  const indicePorNome = {};
  cadastrados.forEach(function(linha, indice) {
    [linha[2], linha[3]].forEach(function(nome) {
      const chave = normalizar_(nome);
      if (chave && indicePorNome[chave] == null) indicePorNome[chave] = indice;
    });
  });

  const historico = coletarFornecedoresHistoricos_(ss);
  const agora = new Date();
  const usuario = obterUsuarioAtual_();
  const novasLinhas = [];
  const atualizacoes = [];

  Object.keys(historico).sort().forEach(function(chave) {
    const item = historico[chave];
    const categoria = valorMaisFrequente_(item.categorias);
    const natureza = valorMaisFrequente_(item.naturezas);
    const metodo = valorMaisFrequente_(item.metodos);
    const centro = valorMaisFrequente_(item.centrosCusto) ||
      inferirCentroCustoHistorico_(categoria, item.nome);
    const indiceExistente = indicePorNome[chave];

    if (indiceExistente != null) {
      const linhaExistente = cadastrados[indiceExistente].slice();
      let alterado = false;
      if (!textoOpcional_(linhaExistente[7]) && categoria) { linhaExistente[7] = categoria; alterado = true; }
      if (!textoOpcional_(linhaExistente[8]) && natureza) { linhaExistente[8] = natureza; alterado = true; }
      if (!textoOpcional_(linhaExistente[9]) && metodo) { linhaExistente[9] = metodo; alterado = true; }
      if (!textoOpcional_(linhaExistente[10]) && centro) { linhaExistente[10] = centro; alterado = true; }
      if (alterado) {
        linhaExistente[13] = agora;
        linhaExistente[14] = usuario;
        atualizacoes.push({ indice: indiceExistente, linha: linhaExistente });
      }
      return;
    }

    const id = gerarIdFornecedor_();
    novasLinhas.push([
      id,
      '',
      item.nome,
      item.nome,
      '',
      '',
      '',
      categoria,
      natureza,
      metodo,
      centro,
      'Revisar',
      'Cadastro automatico a partir do historico da planilha. Confirmar CNPJ e dados de contato.',
      agora,
      usuario
    ]);
    indicePorNome[chave] = cadastrados.length + novasLinhas.length - 1;
  });

  atualizacoes.forEach(function(item) {
    abaCadastro.getRange(item.indice + 2, 1, 1, colunas).setValues([item.linha]);
  });
  if (novasLinhas.length) {
    const primeiraLinha = Math.max(abaCadastro.getLastRow() + 1, 2);
    const ultimaLinha = primeiraLinha + novasLinhas.length - 1;
    if (ultimaLinha > abaCadastro.getMaxRows()) {
      abaCadastro.insertRowsAfter(abaCadastro.getMaxRows(), ultimaLinha - abaCadastro.getMaxRows());
    }
    abaCadastro.getRange(primeiraLinha, 1, novasLinhas.length, colunas).setValues(novasLinhas);
    abaCadastro.getRange(primeiraLinha, 14, novasLinhas.length, 1).setNumberFormat('dd/MM/yyyy HH:mm');
  }

  return {
    sucesso: true,
    criados: novasLinhas.length,
    atualizados: atualizacoes.length,
    encontradosNoHistorico: Object.keys(historico).length,
    fornecedores: listarFornecedoresPortal_({}, ss)
  };
}

function coletarFornecedoresHistoricos_(ss) {
  const historico = {};

  function acumular(nome, categoria, natureza, metodo, centroCusto) {
    const nomeLimpo = textoOpcional_(nome);
    const chave = normalizar_(nomeLimpo);
    if (!chave) return;
    if (!historico[chave]) {
      historico[chave] = {
        nome: nomeLimpo,
        categorias: {},
        naturezas: {},
        metodos: {},
        centrosCusto: {}
      };
    }
    incrementarFrequencia_(historico[chave].categorias, categoria);
    incrementarFrequencia_(historico[chave].naturezas, natureza);
    incrementarFrequencia_(historico[chave].metodos, metodo);
    incrementarFrequencia_(historico[chave].centrosCusto, centroCusto);
  }

  const abaValores = ss.getSheetByName(CONFIG.ABAS.VALORES);
  if (abaValores && abaValores.getLastRow() >= 2) {
    abaValores.getRange(2, 1, abaValores.getLastRow() - 1, 15).getValues().forEach(function(linha) {
      acumular(linha[3], linha[4], linha[10], linha[11], '');
    });
  }

  const abaItens = ss.getSheetByName(CONFIG.ABAS.ITENS);
  if (abaItens && abaItens.getLastRow() >= 2) {
    abaItens.getRange(2, 1, abaItens.getLastRow() - 1, 23).getValues().forEach(function(linha) {
      acumular(linha[4], linha[5], linha[17], linha[18], linha[8]);
    });
  }

  const abaRateio = ss.getSheetByName(CONFIG.ABAS.RATEIO);
  if (abaRateio && abaRateio.getLastRow() >= 2) {
    abaRateio.getRange(2, 1, abaRateio.getLastRow() - 1, 12).getValues().forEach(function(linha) {
      acumular(linha[6], linha[7], '', '', linha[5]);
    });
  }

  return historico;
}

function incrementarFrequencia_(mapa, valor) {
  const texto = textoOpcional_(valor);
  if (!texto) return;
  mapa[texto] = (mapa[texto] || 0) + 1;
}

function valorMaisFrequente_(mapa) {
  return Object.keys(mapa || {}).sort(function(a, b) {
    const diferenca = Number(mapa[b] || 0) - Number(mapa[a] || 0);
    return diferenca || a.localeCompare(b, 'pt-BR');
  })[0] || '';
}

function inferirCentroCustoHistorico_(categoria, nomeFornecedor) {
  const texto = normalizar_(categoria + ' ' + nomeFornecedor);
  if (/medicamento|injetavel|farmacia|descartavel/.test(texto)) return 'Farmácia';
  if (/tecnologia|informatica|software|impressora/.test(texto)) return 'Tecnologia';
  if (/papelaria|escritorio|grafica|copiadora/.test(texto)) return 'Escritório';
  if (/reparo|manutencao|engenharia/.test(texto)) return 'Manutenção';
  if (/consumo|alimento|cafe|agua/.test(texto)) return 'Café e Copa';
  if (/marketing|promocional/.test(texto)) return 'Marketing';
  return 'Outros';
}

/** Pesquisa fornecedores por nome, CNPJ, contato, e-mail ou status. */
function listarFornecedoresPortal(filtros) {
  return listarFornecedoresPortal_(filtros || {}, obterPlanilhaPortal_());
}

function listarFornecedoresPortal_(filtros, ss) {
  const aba = ss.getSheetByName(CONFIG.ABAS.FORNECEDORES);
  if (!aba || aba.getLastRow() < 2) return [];

  const termo = normalizar_(filtros.termo);
  const cnpjTermo = normalizarCnpj_(filtros.termo);
  const statusFiltro = normalizar_(filtros.status);
  const limite = Math.min(Math.max(Number(filtros.limite || 500), 1), 500);
  const colunas = CONFIG.CABECALHOS.FORNECEDORES.length;

  return aba.getRange(2, 1, aba.getLastRow() - 1, colunas).getValues()
    .map(function(linha, indice) {
      return fornecedorLinhaParaObjeto_(linha, indice + 2);
    })
    .filter(function(fornecedor) {
      if (!fornecedor.id) return false;
      if (statusFiltro && statusFiltro !== 'todos' && normalizar_(fornecedor.status) !== statusFiltro) {
        return false;
      }

      if (!termo && !cnpjTermo) return true;

      const campos = [
        fornecedor.id,
        fornecedor.cnpj,
        fornecedor.razaoSocial,
        fornecedor.nomeComercial,
        fornecedor.contato,
        fornecedor.telefone,
        fornecedor.email,
        fornecedor.categoriaPadrao
      ].map(normalizar_).join(' ');

      return campos.indexOf(termo) !== -1 ||
        (cnpjTermo && normalizarCnpj_(fornecedor.cnpj).indexOf(cnpjTermo) !== -1);
    })
    .sort(function(a, b) {
      return normalizar_(a.nomeComercial || a.razaoSocial)
        .localeCompare(normalizar_(b.nomeComercial || b.razaoSocial), 'pt-BR');
    })
    .slice(0, limite);
}

/** Cria ou atualiza um fornecedor e devolve a lista atualizada. */
function salvarFornecedorPortal(payload) {
  const registro = validarFornecedorPortal_(payload);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const ss = obterPlanilhaPortal_();
    const aba = ss.getSheetByName(CONFIG.ABAS.FORNECEDORES);
    if (!aba) throw new Error('A aba Cadastro de Fornecedores nao foi encontrada.');

    const colunas = CONFIG.CABECALHOS.FORNECEDORES.length;
    const quantidadeDados = Math.max(aba.getLastRow() - 1, 0);
    const dados = quantidadeDados > 0
      ? aba.getRange(2, 1, quantidadeDados, colunas).getValues()
      : [];

    const indiceId = registro.id
      ? dados.findIndex(function(linha) { return String(linha[0]) === registro.id; })
      : -1;

    if (registro.id && indiceId === -1) {
      throw new Error('Fornecedor nao encontrado para atualizacao. Atualize a lista e tente novamente.');
    }

    if (registro.cnpj) {
      const duplicado = dados.find(function(linha, indice) {
        return indice !== indiceId && normalizarCnpj_(linha[1]) === normalizarCnpj_(registro.cnpj);
      });

      if (duplicado) {
        throw new Error('Ja existe um fornecedor cadastrado com este CNPJ.');
      }
    }

    const agora = new Date();
    const usuario = obterUsuarioAtual_();
    const id = registro.id || gerarIdFornecedor_();
    const linha = [
      id,
      registro.cnpj,
      registro.razaoSocial,
      registro.nomeComercial,
      registro.contato,
      registro.telefone,
      registro.email,
      registro.categoriaPadrao,
      registro.naturezaOperacaoPadrao,
      registro.metodoPagamentoPadrao,
      registro.centroCustoPadrao,
      registro.status,
      registro.observacoes,
      agora,
      usuario
    ];

    const numeroLinha = indiceId >= 0 ? indiceId + 2 : Math.max(aba.getLastRow() + 1, 2);
    aba.getRange(numeroLinha, 1, 1, colunas).setValues([linha]);
    aba.getRange(numeroLinha, 14).setNumberFormat('dd/MM/yyyy HH:mm');
    sincronizarFornecedorNosPrecos_(ss, id, registro.nomeComercial || registro.razaoSocial, registro.cnpj);
    SpreadsheetApp.flush();

    const fornecedores = listarFornecedoresPortal_({}, ss);
    return {
      sucesso: true,
      modo: indiceId >= 0 ? 'atualizado' : 'criado',
      fornecedor: fornecedorLinhaParaObjeto_(linha, numeroLinha),
      fornecedores: fornecedores,
      resumo: resumirFornecedores_(fornecedores)
    };
  } finally {
    lock.releaseLock();
  }
}

function validarFornecedorPortal_(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Os dados do fornecedor nao foram enviados.');
  }

  const cnpjNumeros = normalizarCnpj_(payload.cnpj);
  const razaoSocial = textoOpcional_(payload.razaoSocial);
  const nomeComercial = textoOpcional_(payload.nomeComercial);
  const email = textoOpcional_(payload.email).toLowerCase();

  if (!razaoSocial && !nomeComercial) {
    throw new Error('Informe a Razao Social ou o Nome Comercial.');
  }

  if (cnpjNumeros && !validarCnpjBrasileiro_(cnpjNumeros)) {
    throw new Error('O CNPJ informado nao e valido.');
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Informe um e-mail valido.');
  }

  const statusSolicitado = textoOpcional_(payload.status) || 'Ativo';
  const statusPermitido = CONFIG.STATUS.CADASTRO.some(function(status) {
    return normalizar_(status) === normalizar_(statusSolicitado);
  });

  if (!statusPermitido) throw new Error('Status do fornecedor invalido.');

  return {
    id: textoOpcional_(payload.id),
    cnpj: cnpjNumeros ? formatarCnpj_(cnpjNumeros) : '',
    razaoSocial: razaoSocial,
    nomeComercial: nomeComercial,
    contato: textoOpcional_(payload.contato),
    telefone: formatarTelefone_(payload.telefone),
    email: email,
    categoriaPadrao: textoOpcional_(payload.categoriaPadrao),
    naturezaOperacaoPadrao: textoOpcional_(payload.naturezaOperacaoPadrao),
    metodoPagamentoPadrao: textoOpcional_(payload.metodoPagamentoPadrao),
    centroCustoPadrao: textoOpcional_(payload.centroCustoPadrao),
    status: cnpjNumeros ? statusSolicitado : 'Revisar',
    observacoes: textoOpcional_(payload.observacoes)
  };
}

function fornecedorLinhaParaObjeto_(linha, numeroLinha) {
  const atualizado = linha[13];
  return {
    id: textoOpcional_(linha[0]),
    cnpj: textoOpcional_(linha[1]),
    razaoSocial: textoOpcional_(linha[2]),
    nomeComercial: textoOpcional_(linha[3]),
    contato: textoOpcional_(linha[4]),
    telefone: textoOpcional_(linha[5]),
    email: textoOpcional_(linha[6]),
    categoriaPadrao: textoOpcional_(linha[7]),
    naturezaOperacaoPadrao: textoOpcional_(linha[8]),
    metodoPagamentoPadrao: textoOpcional_(linha[9]),
    centroCustoPadrao: textoOpcional_(linha[10]),
    status: textoOpcional_(linha[11]) || 'Revisar',
    observacoes: textoOpcional_(linha[12]),
    atualizadoEm: atualizado instanceof Date && !isNaN(atualizado.getTime())
      ? Utilities.formatDate(atualizado, CONFIG.FUSO_HORARIO, 'dd/MM/yyyy HH:mm')
      : textoOpcional_(atualizado),
    atualizadoPor: textoOpcional_(linha[14]),
    numeroLinha: numeroLinha || ''
  };
}

function obterOpcoesCadastroFornecedor_(ss) {
  const fallback = opcoesFormularioPadrao_();
  const listas = ss.getSheetByName(CONFIG.ABAS.LISTAS);
  const categorias = obterValoresUnicosDeColunas_(ss, [
    { aba: CONFIG.ABAS.VALORES, coluna: 5 },
    { aba: CONFIG.ABAS.ITENS, coluna: 6 }
  ]);
  const naturezas = obterValoresUnicosDeColunas_(ss, [
    { aba: CONFIG.ABAS.VALORES, coluna: 11 },
    { aba: CONFIG.ABAS.ITENS, coluna: 18 }
  ]);

  return {
    categorias: comFallback_(categorias, fallback.categorias),
    naturezasOperacao: comFallback_(naturezas, fallback.naturezasOperacao),
    metodosPagamento: comFallback_(listas ? lerColunaSemVazios_(listas, 4) : [], fallback.metodosPagamento),
    centrosCusto: comFallback_(listas ? lerColunaSemVazios_(listas, 2) : [], fallback.centrosCusto),
    unidadesMedida: comFallback_(listas ? lerColunaSemVazios_(listas, 3) : [], fallback.unidadesMedida),
    status: CONFIG.STATUS.CADASTRO.slice(),
    statusPreco: CONFIG.STATUS.PRECO.slice(),
    tiposAcordo: CONFIG.TIPOS_ACORDO.slice()
  };
}

function resumirFornecedores_(fornecedores) {
  return (fornecedores || []).reduce(function(resumo, fornecedor) {
    resumo.total += 1;
    const status = normalizar_(fornecedor.status);
    if (status === normalizar_('Ativo')) resumo.ativos += 1;
    else if (status === normalizar_('Inativo')) resumo.inativos += 1;
    else resumo.revisar += 1;
    return resumo;
  }, { total: 0, ativos: 0, revisar: 0, inativos: 0 });
}

/** Lista os acordos de preço cadastrados no portal. */
function listarPrecosPortal(filtros) {
  const ss = obterPlanilhaPortal_();
  const fornecedores = listarFornecedoresPortal_({}, ss);
  return listarPrecosPortal_(filtros || {}, ss, fornecedores);
}

function listarPrecosPortal_(filtros, ss, fornecedores) {
  const aba = ss.getSheetByName(CONFIG.ABAS.PRECOS);
  if (!aba) return [];

  garantirEstruturaPrecosPortal_(aba);
  if (aba.getLastRow() < 2) return [];

  const termo = normalizar_(filtros.termo);
  const cnpjTermo = normalizarCnpj_(filtros.termo);
  const statusFiltro = normalizar_(filtros.status);
  const fornecedorFiltro = textoOpcional_(filtros.fornecedorId);
  const limite = Math.min(Math.max(Number(filtros.limite || 500), 1), 500);
  const colunas = CONFIG.CABECALHOS.PRECOS.length;
  const fornecedoresPorId = {};

  (fornecedores || listarFornecedoresPortal_({}, ss)).forEach(function(fornecedor) {
    fornecedoresPorId[fornecedor.id] = fornecedor;
  });

  return aba.getRange(2, 1, aba.getLastRow() - 1, colunas).getValues()
    .map(function(linha, indice) {
      return precoLinhaParaObjeto_(linha, indice + 2, fornecedoresPorId);
    })
    .filter(function(preco) {
      if (!preco.id || !preco.itemPadronizado) return false;
      if (fornecedorFiltro && preco.fornecedorId !== fornecedorFiltro) return false;
      if (statusFiltro && statusFiltro !== 'todos' && normalizar_(preco.status) !== statusFiltro) {
        return false;
      }

      if (!termo && !cnpjTermo) return true;
      const campos = [
        preco.id,
        preco.fornecedor,
        preco.cnpj,
        preco.itemPadronizado,
        preco.palavrasChave,
        preco.categoria,
        preco.centroCusto,
        preco.tipoAcordo
      ].map(normalizar_).join(' ');

      return campos.indexOf(termo) !== -1 ||
        (cnpjTermo && normalizarCnpj_(preco.cnpj).indexOf(cnpjTermo) !== -1);
    })
    .sort(function(a, b) {
      const fornecedor = normalizar_(a.fornecedor).localeCompare(normalizar_(b.fornecedor), 'pt-BR');
      if (fornecedor !== 0) return fornecedor;
      return normalizar_(a.itemPadronizado).localeCompare(normalizar_(b.itemPadronizado), 'pt-BR');
    })
    .slice(0, limite);
}

/** Cria ou atualiza um preço negociado e devolve a lista atualizada. */
function salvarPrecoPortal(payload) {
  const registro = validarPrecoPortal_(payload);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const ss = obterPlanilhaPortal_();
    const aba = ss.getSheetByName(CONFIG.ABAS.PRECOS);
    if (!aba) throw new Error('A aba Tabela de Preços Negociados não foi encontrada.');
    garantirEstruturaPrecosPortal_(aba);

    const fornecedores = listarFornecedoresPortal_({}, ss);
    const fornecedor = fornecedores.find(function(item) { return item.id === registro.fornecedorId; });
    if (!fornecedor) throw new Error('Fornecedor não encontrado. Atualize o portal e tente novamente.');
    if (normalizar_(fornecedor.status) === normalizar_('Inativo')) {
      throw new Error('Não é possível vincular um preço a um fornecedor inativo.');
    }
    aplicarPadroesFornecedorPreco_(registro, fornecedor);

    const colunas = CONFIG.CABECALHOS.PRECOS.length;
    const quantidadeDados = Math.max(aba.getLastRow() - 1, 0);
    const dados = quantidadeDados > 0
      ? aba.getRange(2, 1, quantidadeDados, colunas).getValues()
      : [];
    const indiceId = registro.id
      ? dados.findIndex(function(linha) { return textoOpcional_(linha[16]) === registro.id; })
      : -1;

    if (registro.id && indiceId === -1) {
      throw new Error('Preço negociado não encontrado. Atualize a lista e tente novamente.');
    }

    const conflito = existeConflitoPreco_(registro, dados, indiceId);

    if (conflito && ['Ativo', 'Revisar'].some(function(status) {
      return normalizar_(status) === normalizar_(registro.status);
    })) {
      throw new Error('Já existe um preço vigente para este fornecedor, item e unidade. Edite o cadastro existente.');
    }

    const agora = new Date();
    const usuario = obterUsuarioAtual_();
    const id = registro.id || gerarIdPreco_();
    const linha = criarLinhaPrecoPlanilha_(registro, fornecedor, id, agora, usuario);

    const numeroLinha = indiceId >= 0 ? indiceId + 2 : Math.max(aba.getLastRow() + 1, 2);
    aba.getRange(numeroLinha, 1, 1, colunas).setValues([linha]);
    aba.getRange(numeroLinha, 6, 1, 2).setNumberFormat('[$R$ -416]#,##0.00##');
    aba.getRange(numeroLinha, 11, 1, 2).setNumberFormat('dd/MM/yyyy');
    aba.getRange(numeroLinha, 18).setNumberFormat('dd/MM/yyyy HH:mm');
    SpreadsheetApp.flush();

    const precos = listarPrecosPortal_({}, ss, fornecedores);
    const fornecedoresPorId = {};
    fornecedores.forEach(function(item) { fornecedoresPorId[item.id] = item; });

    return {
      sucesso: true,
      modo: indiceId >= 0 ? 'atualizado' : 'criado',
      preco: precoLinhaParaObjeto_(linha, numeroLinha, fornecedoresPorId),
      precos: precos,
      resumo: resumirPrecos_(precos)
    };
  } finally {
    lock.releaseLock();
  }
}

/** Cadastra vários preços em uma única gravação validada. */
function salvarPrecosEmLotePortal(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Os dados do lote não foram enviados.');
  }

  const fornecedorId = textoObrigatorio_(payload.fornecedorId, 'Fornecedor');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    const ss = obterPlanilhaPortal_();
    const aba = ss.getSheetByName(CONFIG.ABAS.PRECOS);
    if (!aba) throw new Error('A aba Tabela de Preços Negociados não foi encontrada.');
    garantirEstruturaPrecosPortal_(aba);

    const fornecedores = listarFornecedoresPortal_({}, ss);
    const fornecedor = fornecedores.find(function(item) { return item.id === fornecedorId; });
    if (!fornecedor) throw new Error('Fornecedor não encontrado. Atualize o portal e tente novamente.');
    if (normalizar_(fornecedor.status) === normalizar_('Inativo')) {
      throw new Error('Não é possível vincular preços a um fornecedor inativo.');
    }

    const colunas = CONFIG.CABECALHOS.PRECOS.length;
    const quantidadeDados = Math.max(aba.getLastRow() - 1, 0);
    const dados = quantidadeDados > 0
      ? aba.getRange(2, 1, quantidadeDados, colunas).getValues()
      : [];
    const agora = new Date();
    const usuario = obterUsuarioAtual_();
    const preparacao = prepararRegistrosLotePrecos_(payload, fornecedor, dados, agora, usuario);
    const primeiraLinha = Math.max(aba.getLastRow() + 1, 2);
    const ultimaLinhaNecessaria = primeiraLinha + preparacao.linhas.length - 1;

    if (ultimaLinhaNecessaria > aba.getMaxRows()) {
      aba.insertRowsAfter(aba.getMaxRows(), ultimaLinhaNecessaria - aba.getMaxRows());
    }

    aba.getRange(primeiraLinha, 1, preparacao.linhas.length, colunas).setValues(preparacao.linhas);
    aba.getRange(primeiraLinha, 6, preparacao.linhas.length, 2).setNumberFormat('[$R$ -416]#,##0.00##');
    aba.getRange(primeiraLinha, 11, preparacao.linhas.length, 2).setNumberFormat('dd/MM/yyyy');
    aba.getRange(primeiraLinha, 18, preparacao.linhas.length, 1).setNumberFormat('dd/MM/yyyy HH:mm');
    registrarLogImportacaoPrecos_(ss, payload.origem, fornecedor, preparacao.linhas.length, usuario, agora);
    SpreadsheetApp.flush();

    const precos = listarPrecosPortal_({}, ss, fornecedores);
    return {
      sucesso: true,
      quantidade: preparacao.linhas.length,
      precos: precos,
      resumo: resumirPrecos_(precos)
    };
  } finally {
    lock.releaseLock();
  }
}

/** Analisa uma nota fiscal em PDF e devolve dados estruturados para conferência. */
function analisarNotaFiscalPdfPortal(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('O arquivo PDF não foi enviado.');
  }

  const nomeArquivo = textoObrigatorio_(payload.nomeArquivo, 'Nome do arquivo');
  if (!/\.pdf$/i.test(nomeArquivo)) {
    throw new Error('Selecione um arquivo no formato PDF.');
  }

  const base64 = String(payload.base64 || '').replace(/^data:application\/pdf;base64,/i, '').trim();
  if (!base64) throw new Error('O PDF está vazio ou não pôde ser lido.');

  const tamanhoEstimado = Math.floor(base64.length * 3 / 4);
  if (tamanhoEstimado > CONFIG.OPENAI.TAMANHO_MAXIMO_PDF_BYTES) {
    throw new Error('O PDF deve ter no máximo 15 MB.');
  }

  const propriedades = PropertiesService.getScriptProperties();
  const apiKey = propriedades.getProperty(CONFIG.OPENAI.PROPRIEDADE_CHAVE);
  if (!apiKey) {
    throw new Error('A leitura inteligente de PDF ainda não foi configurada.');
  }

  const modelo = propriedades.getProperty(CONFIG.OPENAI.PROPRIEDADE_MODELO) ||
    CONFIG.OPENAI.MODELO_PADRAO;
  const corpo = criarRequisicaoLeituraPdf_(nomeArquivo, base64, modelo);
  const respostaHttp = UrlFetchApp.fetch('https://api.openai.com/v1/responses', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + apiKey },
    payload: JSON.stringify(corpo),
    muteHttpExceptions: true
  });

  const codigo = respostaHttp.getResponseCode();
  const textoResposta = respostaHttp.getContentText();
  let resposta;
  try {
    resposta = JSON.parse(textoResposta);
  } catch (erro) {
    throw new Error('A leitura do PDF retornou uma resposta inválida. Tente novamente.');
  }

  if (codigo < 200 || codigo >= 300) {
    console.error('Falha OpenAI PDF. HTTP ' + codigo + ': ' +
      (resposta && resposta.error ? resposta.error.type || 'erro_api' : 'erro_desconhecido'));
    if (codigo === 401 || codigo === 403) {
      throw new Error('A credencial da leitura inteligente precisa ser revisada.');
    }
    if (codigo === 429) {
      throw new Error('O limite da leitura inteligente foi atingido. Aguarde e tente novamente.');
    }
    throw new Error('Não foi possível analisar o PDF agora. Tente novamente em alguns instantes.');
  }

  const textoJson = extrairTextoRespostaOpenAI_(resposta);
  let dados;
  try {
    dados = JSON.parse(textoJson);
  } catch (erro) {
    throw new Error('A leitura foi concluída, mas os dados da nota vieram incompletos.');
  }

  return normalizarAnaliseNotaPdf_(dados, nomeArquivo, modelo);
}

function criarRequisicaoLeituraPdf_(nomeArquivo, base64, modelo) {
  return {
    model: modelo,
    store: false,
    input: [
      {
        role: 'developer',
        content: [{
          type: 'input_text',
          text: [
            'Você é um extrator especializado em documentos fiscais brasileiros.',
            'Analise todas as páginas do PDF, inclusive tabelas e imagens escaneadas.',
            'Extraia somente dados visíveis no documento. Nunca invente valores ausentes.',
            'Para texto ausente use string vazia; para número ausente use 0.',
            'Use confiança baixa quando o campo estiver cortado, ilegível ou ambíguo.',
            'Itens devem representar as linhas de produtos ou serviços da nota, sem incluir impostos ou totais como itens.',
            'Valores monetários devem ser números decimais, sem símbolo de moeda.',
            'A data deve usar o formato AAAA-MM-DD quando estiver legível.'
          ].join(' ')
        }]
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_file',
            filename: nomeArquivo,
            file_data: 'data:application/pdf;base64,' + base64
          },
          {
            type: 'input_text',
            text: 'Extraia os dados desta nota fiscal para conferência antes do cadastro.'
          }
        ]
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'nota_fiscal_brasileira',
        strict: true,
        schema: schemaNotaFiscalPdf_()
      }
    }
  };
}

function schemaNotaFiscalPdf_() {
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'documentoFiscal', 'numeroNota', 'serie', 'chaveAcesso', 'dataEmissao',
      'fornecedor', 'valorTotal', 'moeda', 'confiancaGeral', 'avisos', 'itens'
    ],
    properties: {
      documentoFiscal: { type: 'boolean' },
      numeroNota: { type: 'string' },
      serie: { type: 'string' },
      chaveAcesso: { type: 'string' },
      dataEmissao: { type: 'string' },
      fornecedor: {
        type: 'object',
        additionalProperties: false,
        required: ['cnpj', 'razaoSocial', 'nomeFantasia'],
        properties: {
          cnpj: { type: 'string' },
          razaoSocial: { type: 'string' },
          nomeFantasia: { type: 'string' }
        }
      },
      valorTotal: { type: 'number' },
      moeda: { type: 'string' },
      confiancaGeral: { type: 'string', enum: ['alta', 'media', 'baixa'] },
      avisos: { type: 'array', items: { type: 'string' } },
      itens: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'codigo', 'descricao', 'quantidade', 'unidade', 'valorUnitario',
            'valorTotal', 'ncm', 'confianca'
          ],
          properties: {
            codigo: { type: 'string' },
            descricao: { type: 'string' },
            quantidade: { type: 'number' },
            unidade: { type: 'string' },
            valorUnitario: { type: 'number' },
            valorTotal: { type: 'number' },
            ncm: { type: 'string' },
            confianca: { type: 'string', enum: ['alta', 'media', 'baixa'] }
          }
        }
      }
    }
  };
}

function extrairTextoRespostaOpenAI_(resposta) {
  if (resposta && typeof resposta.output_text === 'string' && resposta.output_text.trim()) {
    return resposta.output_text.trim();
  }

  const textos = [];
  (resposta && Array.isArray(resposta.output) ? resposta.output : []).forEach(function(item) {
    (item && Array.isArray(item.content) ? item.content : []).forEach(function(conteudo) {
      if (conteudo && conteudo.type === 'refusal') {
        throw new Error('O PDF não pôde ser processado pela leitura inteligente.');
      }
      if (conteudo && conteudo.type === 'output_text' && conteudo.text) {
        textos.push(String(conteudo.text));
      }
    });
  });

  if (!textos.length) throw new Error('A leitura não encontrou conteúdo utilizável no PDF.');
  return textos.join('').trim();
}

function normalizarAnaliseNotaPdf_(dados, nomeArquivo, modelo) {
  if (!dados || dados.documentoFiscal !== true) {
    throw new Error('O PDF não foi reconhecido como uma nota fiscal.');
  }

  const itensOrigem = Array.isArray(dados.itens) ? dados.itens : [];
  const itens = itensOrigem.slice(0, CONFIG.OPENAI.MAXIMO_ITENS).map(function(item) {
    const descricao = textoOpcional_(item && item.descricao);
    const quantidade = numeroNaoNegativoPdf_(item && item.quantidade);
    const total = numeroNaoNegativoPdf_(item && item.valorTotal);
    let valorUnitario = numeroNaoNegativoPdf_(item && item.valorUnitario);
    if (!valorUnitario && quantidade > 0 && total > 0) valorUnitario = total / quantidade;

    return {
      itemPadronizado: descricao,
      palavrasChave: [descricao, textoOpcional_(item && item.codigo), textoOpcional_(item && item.ncm)]
        .filter(Boolean).join(', '),
      unidadeMedida: textoOpcional_(item && item.unidade) || 'Unidade',
      quantidadeReferencia: quantidade > 0 ? String(arredondarPdf_(quantidade)) : '',
      valorUnitarioInicial: valorUnitario > 0 ? arredondarPdf_(valorUnitario) : '',
      valorUnitarioNegociado: valorUnitario > 0 ? arredondarPdf_(valorUnitario) : '',
      codigo: textoOpcional_(item && item.codigo),
      ncm: textoOpcional_(item && item.ncm),
      confianca: normalizarConfiancaPdf_(item && item.confianca),
      observacoes: 'Leitura por IA: confiança ' + normalizarConfiancaPdf_(item && item.confianca)
    };
  }).filter(function(item) { return !!item.itemPadronizado; });

  if (!itens.length) throw new Error('Nenhum item utilizável foi encontrado no PDF.');

  const fornecedor = dados.fornecedor || {};
  const confianca = normalizarConfiancaPdf_(dados.confiancaGeral);
  const avisos = Array.isArray(dados.avisos)
    ? dados.avisos.map(textoOpcional_).filter(Boolean).slice(0, 10)
    : [];

  if (itensOrigem.length > CONFIG.OPENAI.MAXIMO_ITENS) {
    avisos.push('A nota possui mais de 100 itens; somente os 100 primeiros foram carregados.');
  }

  return {
    fornecedorCnpj: textoOpcional_(fornecedor.cnpj),
    fornecedorNome: textoOpcional_(fornecedor.nomeFantasia) || textoOpcional_(fornecedor.razaoSocial),
    dataEmissao: normalizarDataIsoPdf_(dados.dataEmissao),
    statusSugerido: confianca === 'alta' ? 'Ativo' : 'Revisar',
    itens: itens,
    origem: {
      tipo: 'PDF_IA',
      arquivo: nomeArquivo,
      numeroNota: textoOpcional_(dados.numeroNota),
      serie: textoOpcional_(dados.serie),
      chave: textoOpcional_(dados.chaveAcesso),
      fornecedorCnpj: textoOpcional_(fornecedor.cnpj),
      fornecedorNome: textoOpcional_(fornecedor.nomeFantasia) || textoOpcional_(fornecedor.razaoSocial),
      valorNota: numeroNaoNegativoPdf_(dados.valorTotal),
      confianca: confianca,
      avisos: avisos,
      modelo: modelo
    }
  };
}

function numeroNaoNegativoPdf_(valor) {
  const numero = Number(valor);
  return isFinite(numero) && numero >= 0 ? numero : 0;
}

function arredondarPdf_(valor) {
  return Math.round((Number(valor) + Number.EPSILON) * 10000) / 10000;
}

function normalizarConfiancaPdf_(valor) {
  const confianca = normalizar_(valor);
  if (confianca === 'alta' || confianca === 'media' || confianca === 'baixa') return confianca;
  return 'baixa';
}

function normalizarDataIsoPdf_(valor) {
  const texto = textoOpcional_(valor);
  const correspondencia = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!correspondencia) return '';
  const data = new Date(Number(correspondencia[1]), Number(correspondencia[2]) - 1, Number(correspondencia[3]));
  if (data.getFullYear() !== Number(correspondencia[1]) ||
      data.getMonth() !== Number(correspondencia[2]) - 1 ||
      data.getDate() !== Number(correspondencia[3])) return '';
  return correspondencia[1] + '-' + correspondencia[2] + '-' + correspondencia[3];
}

function prepararRegistrosLotePrecos_(payload, fornecedor, dadosExistentes, agora, usuario) {
  const itens = Array.isArray(payload.itens) ? payload.itens : [];
  if (itens.length === 0) throw new Error('Adicione ao menos um item ao lote.');
  if (itens.length > 100) throw new Error('Cada lote pode conter no máximo 100 itens.');

  const dadosComLote = (dadosExistentes || []).slice();
  const registros = [];
  const linhas = [];

  itens.forEach(function(item, indice) {
    try {
      const registro = validarPrecoPortal_({
        fornecedorId: payload.fornecedorId,
        itemPadronizado: item.itemPadronizado,
        palavrasChave: item.palavrasChave,
        unidadeMedida: item.unidadeMedida,
        valorUnitarioInicial: item.valorUnitarioInicial,
        valorUnitarioNegociado: item.valorUnitarioNegociado,
        categoria: item.categoria,
        centroCusto: item.centroCusto,
        condicaoNegociada: textoOpcional_(item.condicaoNegociada) || textoOpcional_(payload.condicaoNegociada),
        vigenciaInicial: item.vigenciaInicial || payload.vigenciaInicial,
        vigenciaFinal: item.vigenciaFinal || payload.vigenciaFinal,
        status: item.status || payload.status,
        observacoes: comporObservacaoOrigemLote_(item, payload.origem),
        tipoAcordo: item.tipoAcordo || payload.tipoAcordo
      });

      aplicarPadroesFornecedorPreco_(registro, fornecedor);
      const conflito = existeConflitoPreco_(registro, dadosComLote, -1);
      const statusComparavel = ['Ativo', 'Revisar'].some(function(status) {
        return normalizar_(status) === normalizar_(registro.status);
      });
      if (conflito && statusComparavel) {
        throw new Error('já existe um preço vigente para este fornecedor, item e unidade.');
      }

      const id = gerarIdPreco_();
      const linha = criarLinhaPrecoPlanilha_(registro, fornecedor, id, agora, usuario);
      registros.push(registro);
      linhas.push(linha);
      dadosComLote.push(linha);
    } catch (erro) {
      throw new Error('Item ' + (indice + 1) + ': ' + erro.message);
    }
  });

  return { registros: registros, linhas: linhas };
}

function aplicarPadroesFornecedorPreco_(registro, fornecedor) {
  registro.categoria = registro.categoria || textoOpcional_(fornecedor.categoriaPadrao);
  registro.centroCusto = registro.centroCusto || textoOpcional_(fornecedor.centroCustoPadrao);
  return registro;
}

function existeConflitoPreco_(registro, dados, indiceIgnorar) {
  return (dados || []).find(function(linha, indice) {
    if (indice === indiceIgnorar) return false;
    const mesmoFornecedor = textoOpcional_(linha[15]) === registro.fornecedorId;
    const mesmoItem = normalizar_(linha[2]) === normalizar_(registro.itemPadronizado);
    const mesmaUnidade = normalizar_(linha[4]) === normalizar_(registro.unidadeMedida);
    const statusExistente = obterStatusEfetivoPreco_(linha[12], linha[11]);
    const statusComparavel = ['Ativo', 'Revisar'].some(function(status) {
      return normalizar_(status) === normalizar_(statusExistente);
    });

    return mesmoFornecedor && mesmoItem && mesmaUnidade && statusComparavel &&
      intervalosSobrepostos_(registro.vigenciaInicial, registro.vigenciaFinal, linha[10], linha[11]);
  });
}

function criarLinhaPrecoPlanilha_(registro, fornecedor, id, agora, usuario) {
  const nomeFornecedor = fornecedor.nomeComercial || fornecedor.razaoSocial || fornecedor.id;
  return [
    nomeFornecedor,
    fornecedor.cnpj,
    registro.itemPadronizado,
    registro.palavrasChave,
    registro.unidadeMedida,
    registro.valorUnitarioInicial,
    registro.valorUnitarioNegociado,
    registro.categoria,
    registro.centroCusto,
    registro.condicaoNegociada,
    registro.vigenciaInicial,
    registro.vigenciaFinal || '',
    registro.status,
    registro.observacoes,
    registro.tipoAcordo,
    registro.fornecedorId,
    id,
    agora,
    usuario
  ];
}

function comporObservacaoOrigemLote_(item, origem) {
  const observacoes = [];
  const observacaoItem = textoOpcional_(item && item.observacoes);
  if (observacaoItem) observacoes.push(observacaoItem);

  if (origem && (normalizar_(origem.tipo).indexOf('xml') !== -1 ||
      normalizar_(origem.tipo).indexOf('pdf') !== -1)) {
    const ehPdf = normalizar_(origem.tipo).indexOf('pdf') !== -1;
    const ehPdfGratuito = ehPdf && normalizar_(origem.tipo).indexOf('gratuito') !== -1;
    const dadosOrigem = [ehPdf
      ? (ehPdfGratuito ? 'Origem: PDF com leitura gratuita' : 'Origem: PDF lido por IA')
      : 'Origem: XML NF-e'];
    if (textoOpcional_(origem.numeroNota)) dadosOrigem.push('NF ' + textoOpcional_(origem.numeroNota));
    if (textoOpcional_(item.codigo)) dadosOrigem.push('código ' + textoOpcional_(item.codigo));
    if (textoOpcional_(item.ncm)) dadosOrigem.push('NCM ' + textoOpcional_(item.ncm));
    if (textoOpcional_(item.quantidadeReferencia)) {
      dadosOrigem.push('quantidade na nota ' + textoOpcional_(item.quantidadeReferencia));
    }
    if (ehPdf && textoOpcional_(item.confianca)) {
      dadosOrigem.push('confiança ' + textoOpcional_(item.confianca));
    }
    observacoes.push(dadosOrigem.join(' | '));
  }

  return observacoes.join('\n');
}

function registrarLogImportacaoPrecos_(ss, origem, fornecedor, quantidade, usuario, agora) {
  if (!origem) return;
  const tipoNormalizado = normalizar_(origem.tipo);
  const ehXml = tipoNormalizado.indexOf('xml') !== -1;
  const ehPdf = tipoNormalizado.indexOf('pdf') !== -1;
  if (!ehXml && !ehPdf) return;
  const aba = ss.getSheetByName(CONFIG.ABAS.LOG);
  if (!aba) return;

  const observacaoTecnica = ehPdf
    ? (tipoNormalizado.indexOf('gratuito') !== -1
      ? 'Cadastro em lote apos leitura gratuita no navegador'
      : 'Cadastro em lote apos leitura por IA') +
      (textoOpcional_(origem.confianca) ? ' | confiança ' + textoOpcional_(origem.confianca) : '') +
      (textoOpcional_(origem.modelo) ? ' | modelo ' + textoOpcional_(origem.modelo) : '')
    : 'Cadastro em lote da tabela de preços negociados';

  const linha = [
    agora,
    usuario,
    textoOpcional_(origem.arquivo),
    ehPdf
      ? (tipoNormalizado.indexOf('gratuito') !== -1 ? 'PDF gratuito' : 'PDF com IA')
      : 'XML NF-e',
    textoOpcional_(origem.numeroNota),
    fornecedor.cnpj,
    fornecedor.nomeComercial || fornecedor.razaoSocial || fornecedor.id,
    'Importado',
    quantidade,
    quantidade,
    observacaoTecnica,
    ''
  ];
  const numeroLinha = Math.max(aba.getLastRow() + 1, 2);
  if (numeroLinha > aba.getMaxRows()) aba.insertRowsAfter(aba.getMaxRows(), 1);
  aba.getRange(numeroLinha, 1, 1, CONFIG.CABECALHOS.LOG.length).setValues([linha]);
  aba.getRange(numeroLinha, 1).setNumberFormat('dd/MM/yyyy HH:mm');
}

function validarPrecoPortal_(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Os dados do preço negociado não foram enviados.');
  }

  const fornecedorId = textoObrigatorio_(payload.fornecedorId, 'Fornecedor');
  const itemPadronizado = textoObrigatorio_(payload.itemPadronizado, 'Item, serviço ou contrato');
  const unidadeMedida = textoObrigatorio_(payload.unidadeMedida, 'Unidade de medida');
  const valorInicial = numeroMonetarioPortal_(payload.valorUnitarioInicial, 'Valor inicial');
  const valorNegociado = numeroMonetarioPortal_(payload.valorUnitarioNegociado, 'Valor negociado');
  const vigenciaInicial = payload.vigenciaInicial
    ? zerarHorario_(converterData_(payload.vigenciaInicial))
    : zerarHorario_(new Date());
  const vigenciaFinal = payload.vigenciaFinal
    ? zerarHorario_(converterData_(payload.vigenciaFinal))
    : null;

  if (vigenciaFinal && vigenciaFinal.getTime() < vigenciaInicial.getTime()) {
    throw new Error('A vigência final não pode ser anterior à vigência inicial.');
  }

  const tipoSolicitado = textoOpcional_(payload.tipoAcordo) || 'Produto';
  const tipo = CONFIG.TIPOS_ACORDO.find(function(item) {
    return normalizar_(item) === normalizar_(tipoSolicitado);
  });
  if (!tipo) throw new Error('Tipo de acordo inválido.');

  const statusSolicitado = textoOpcional_(payload.status) || 'Ativo';
  let status = CONFIG.STATUS.PRECO.find(function(item) {
    return normalizar_(item) === normalizar_(statusSolicitado);
  });
  if (!status) throw new Error('Status do preço inválido.');
  if (normalizar_(status) === normalizar_('Ativo') && vigenciaFinal &&
      vigenciaFinal.getTime() < zerarHorario_(new Date()).getTime()) {
    status = 'Vencido';
  }

  return {
    id: textoOpcional_(payload.id),
    fornecedorId: fornecedorId,
    itemPadronizado: itemPadronizado,
    palavrasChave: normalizarPalavrasChave_(payload.palavrasChave || itemPadronizado),
    unidadeMedida: unidadeMedida,
    valorUnitarioInicial: arredondarValorUnitario_(valorInicial),
    valorUnitarioNegociado: arredondarValorUnitario_(valorNegociado),
    categoria: textoOpcional_(payload.categoria),
    centroCusto: textoOpcional_(payload.centroCusto),
    condicaoNegociada: textoOpcional_(payload.condicaoNegociada),
    vigenciaInicial: vigenciaInicial,
    vigenciaFinal: vigenciaFinal,
    status: status,
    observacoes: textoOpcional_(payload.observacoes),
    tipoAcordo: tipo
  };
}

function precoLinhaParaObjeto_(linha, numeroLinha, fornecedoresPorId) {
  const fornecedorId = textoOpcional_(linha[15]);
  const fornecedorAtual = fornecedoresPorId && fornecedoresPorId[fornecedorId];
  const inicial = Number(linha[5] || 0);
  const negociado = Number(linha[6] || 0);
  const economia = arredondarMoeda_(inicial - negociado);
  const economiaPercentual = inicial > 0
    ? Math.round(((inicial - negociado) / inicial) * 1000) / 10
    : 0;
  const vigenciaFinal = dataValidaOpcional_(linha[11]);
  const atualizado = linha[17];

  return {
    id: textoOpcional_(linha[16]),
    fornecedorId: fornecedorId,
    fornecedor: fornecedorAtual
      ? fornecedorAtual.nomeComercial || fornecedorAtual.razaoSocial || fornecedorAtual.id
      : textoOpcional_(linha[0]),
    cnpj: fornecedorAtual ? fornecedorAtual.cnpj : textoOpcional_(linha[1]),
    itemPadronizado: textoOpcional_(linha[2]),
    palavrasChave: textoOpcional_(linha[3]),
    unidadeMedida: textoOpcional_(linha[4]),
    valorUnitarioInicial: inicial,
    valorUnitarioNegociado: negociado,
    economiaValor: economia,
    economiaPercentual: economiaPercentual,
    categoria: textoOpcional_(linha[7]),
    centroCusto: textoOpcional_(linha[8]),
    condicaoNegociada: textoOpcional_(linha[9]),
    vigenciaInicial: formatarDataIsoPortal_(linha[10]),
    vigenciaInicialFormatada: formatarDataPortal_(linha[10]),
    vigenciaFinal: formatarDataIsoPortal_(linha[11]),
    vigenciaFinalFormatada: formatarDataPortal_(linha[11]),
    diasAteVencimento: vigenciaFinal ? diferencaDias_(zerarHorario_(new Date()), vigenciaFinal) : null,
    status: obterStatusEfetivoPreco_(linha[12], linha[11]),
    observacoes: textoOpcional_(linha[13]),
    tipoAcordo: textoOpcional_(linha[14]) || 'Produto',
    atualizadoEm: atualizado instanceof Date && !isNaN(atualizado.getTime())
      ? Utilities.formatDate(atualizado, CONFIG.FUSO_HORARIO, 'dd/MM/yyyy HH:mm')
      : textoOpcional_(atualizado),
    atualizadoPor: textoOpcional_(linha[18]),
    numeroLinha: numeroLinha || ''
  };
}

function resumirPrecos_(precos) {
  const resumo = (precos || []).reduce(function(total, preco) {
    total.total += 1;
    const status = normalizar_(preco.status);
    if (status === normalizar_('Ativo')) total.ativos += 1;
    else total.atencao += 1;

    if (status === normalizar_('Ativo') && preco.diasAteVencimento != null &&
        preco.diasAteVencimento >= 0 && preco.diasAteVencimento <= 30) {
      total.vencendo += 1;
    }

    if (Number(preco.valorUnitarioInicial) > 0) {
      total.somaEconomiaPercentual += Number(preco.economiaPercentual || 0);
      total.quantidadeEconomia += 1;
    }
    return total;
  }, {
    total: 0,
    ativos: 0,
    vencendo: 0,
    atencao: 0,
    somaEconomiaPercentual: 0,
    quantidadeEconomia: 0
  });

  resumo.economiaMedia = resumo.quantidadeEconomia
    ? Math.round((resumo.somaEconomiaPercentual / resumo.quantidadeEconomia) * 10) / 10
    : 0;
  delete resumo.somaEconomiaPercentual;
  delete resumo.quantidadeEconomia;
  return resumo;
}

function garantirEstruturaPrecosPortal_(aba) {
  const colunas = CONFIG.CABECALHOS.PRECOS.length;
  if (aba.getMaxColumns() < colunas) {
    aba.insertColumnsAfter(aba.getMaxColumns(), colunas - aba.getMaxColumns());
  }

  const cabecalhosAtuais = aba.getRange(1, 1, 1, colunas).getDisplayValues()[0];
  const precisaAtualizar = CONFIG.CABECALHOS.PRECOS.some(function(cabecalho, indice) {
    return textoOpcional_(cabecalhosAtuais[indice]) !== cabecalho;
  });
  if (precisaAtualizar) {
    aba.getRange(1, 1, 1, colunas).setValues([CONFIG.CABECALHOS.PRECOS]);
    formatarCabecalho_(aba, colunas);
  }
}

function garantirEstruturaFornecedoresPortal_(aba) {
  const colunas = CONFIG.CABECALHOS.FORNECEDORES.length;
  if (aba.getMaxColumns() < colunas) {
    aba.insertColumnsAfter(aba.getMaxColumns(), colunas - aba.getMaxColumns());
  }

  const cabecalhosAtuais = aba.getRange(1, 1, 1, colunas).getDisplayValues()[0];
  const precisaAtualizar = CONFIG.CABECALHOS.FORNECEDORES.some(function(cabecalho, indice) {
    return textoOpcional_(cabecalhosAtuais[indice]) !== cabecalho;
  });
  if (precisaAtualizar) {
    aba.getRange(1, 1, 1, colunas).setValues([CONFIG.CABECALHOS.FORNECEDORES]);
    formatarCabecalho_(aba, colunas);
  }
}

function sincronizarFornecedorNosPrecos_(ss, fornecedorId, nomeFornecedor, cnpj) {
  const aba = ss.getSheetByName(CONFIG.ABAS.PRECOS);
  if (!aba || aba.getLastRow() < 2 || aba.getMaxColumns() < 16) return;

  const quantidade = aba.getLastRow() - 1;
  const ids = aba.getRange(2, 16, quantidade, 1).getDisplayValues();
  ids.forEach(function(linha, indice) {
    if (textoOpcional_(linha[0]) === fornecedorId) {
      aba.getRange(indice + 2, 1, 1, 2).setValues([[nomeFornecedor, cnpj]]);
    }
  });
}

function gerarIdPreco_() {
  return 'PRC-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
}

function numeroMonetarioPortal_(valor, nomeCampo) {
  if (typeof valor === 'number' && Number.isFinite(valor) && valor > 0) return valor;
  let texto = String(valor == null ? '' : valor).trim().replace(/R\$/gi, '').replace(/\s/g, '');
  if (texto.indexOf(',') !== -1) texto = texto.replace(/\./g, '').replace(',', '.');
  const numero = Number(texto);
  if (!Number.isFinite(numero) || numero <= 0) {
    throw new Error(nomeCampo + ' deve ser maior que zero.');
  }
  return numero;
}

function normalizarPalavrasChave_(valor) {
  const vistos = {};
  return String(valor || '')
    .split(/[,;\n]+/)
    .map(function(item) { return item.trim(); })
    .filter(function(item) {
      const chave = normalizar_(item);
      if (!chave || vistos[chave]) return false;
      vistos[chave] = true;
      return true;
    })
    .join(', ');
}

function obterStatusEfetivoPreco_(status, vigenciaFinal) {
  const statusAtual = textoOpcional_(status) || 'Revisar';
  const final = dataValidaOpcional_(vigenciaFinal);
  if (final && final.getTime() < zerarHorario_(new Date()).getTime() &&
      normalizar_(statusAtual) === normalizar_('Ativo')) {
    return 'Vencido';
  }
  return statusAtual;
}

function intervalosSobrepostos_(inicioA, fimA, inicioB, fimB) {
  const inicio1 = dataValidaOpcional_(inicioA) || new Date(1900, 0, 1);
  const fim1 = dataValidaOpcional_(fimA) || new Date(2999, 11, 31);
  const inicio2 = dataValidaOpcional_(inicioB) || new Date(1900, 0, 1);
  const fim2 = dataValidaOpcional_(fimB) || new Date(2999, 11, 31);
  return inicio1.getTime() <= fim2.getTime() && inicio2.getTime() <= fim1.getTime();
}

function dataValidaOpcional_(valor) {
  if (valor instanceof Date && !isNaN(valor.getTime())) return zerarHorario_(valor);
  if (!valor) return null;
  try {
    return zerarHorario_(converterData_(valor));
  } catch (erro) {
    return null;
  }
}

function formatarDataIsoPortal_(valor) {
  const data = dataValidaOpcional_(valor);
  return data ? Utilities.formatDate(data, CONFIG.FUSO_HORARIO, 'yyyy-MM-dd') : '';
}

function formatarDataPortal_(valor) {
  const data = dataValidaOpcional_(valor);
  return data ? Utilities.formatDate(data, CONFIG.FUSO_HORARIO, 'dd/MM/yyyy') : '';
}

function zerarHorario_(data) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

function diferencaDias_(inicio, fim) {
  return Math.round((zerarHorario_(fim).getTime() - zerarHorario_(inicio).getTime()) / 86400000);
}

function obterPlanilhaPortal_() {
  return SpreadsheetApp.openById(CONFIG.PLANILHA_ID);
}

function obterUsuarioAtual_() {
  try {
    const chave = Session.getTemporaryActiveUserKey();
    return chave ? 'Usuario ' + chave.slice(0, 10) : 'Portal Web';
  } catch (erro) {
    return 'Portal Web';
  }
}

function gerarIdFornecedor_() {
  return 'FOR-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
}

function validarCnpjBrasileiro_(cnpj) {
  const numeros = normalizarCnpj_(cnpj);
  if (numeros.length !== 14 || /^(\d)\1{13}$/.test(numeros)) return false;

  function calcularDigito(base, pesos) {
    const soma = base.split('').reduce(function(total, digito, indice) {
      return total + Number(digito) * pesos[indice];
    }, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  }

  const primeiro = calcularDigito(numeros.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const segundo = calcularDigito(numeros.slice(0, 12) + primeiro, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return numeros === numeros.slice(0, 12) + primeiro + segundo;
}

function formatarCnpj_(cnpj) {
  const numeros = normalizarCnpj_(cnpj);
  if (numeros.length !== 14) return numeros;
  return numeros.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function formatarTelefone_(telefone) {
  const numeros = String(telefone || '').replace(/\D/g, '').slice(0, 11);
  if (numeros.length === 11) return numeros.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
  if (numeros.length === 10) return numeros.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
  return textoOpcional_(telefone);
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
    garantirFornecedorDoPedido_(ss, payload, registrosItens, numeroPedido);

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
      validacoes: [{ coluna: 12, valores: CONFIG.STATUS.CADASTRO }]
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
  if (aba.getMaxColumns() < cabecalhos.length) {
    aba.insertColumnsAfter(aba.getMaxColumns(), cabecalhos.length - aba.getMaxColumns());
  }

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
      const status = normalizar_(linha[11] || 'Ativo');
      return status === normalizar_('Ativo') || status === '';
    })
    .map(function(linha) {
      return {
        id: linha[0],
        cnpj: linha[1],
        razaoSocial: linha[2],
        nomeComercial: linha[3],
        contato: linha[4],
        telefone: linha[5],
        email: linha[6],
        categoriaPadrao: linha[7],
        naturezaOperacaoPadrao: linha[8],
        metodoPagamentoPadrao: linha[9],
        centroCustoPadrao: linha[10],
        status: linha[11]
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
    const status = normalizar_(linha[11] || 'Ativo');
    if (status && status !== normalizar_('Ativo')) return false;

    const cnpjConfere = cnpjBusca && normalizarCnpj_(linha[1]) === cnpjBusca;
    const razaoConfere = busca && normalizar_(linha[2]).indexOf(busca) !== -1;
    const nomeConfere = busca && normalizar_(linha[3]).indexOf(busca) !== -1;
    return cnpjConfere || razaoConfere || nomeConfere;
  });

  if (!encontrado) return null;

  return {
    id: encontrado[0],
    cnpj: encontrado[1],
    razaoSocial: encontrado[2],
    nomeComercial: encontrado[3],
    contato: encontrado[4],
    telefone: encontrado[5],
    email: encontrado[6],
    categoriaPadrao: encontrado[7],
    naturezaOperacaoPadrao: encontrado[8],
    metodoPagamentoPadrao: encontrado[9],
    centroCustoPadrao: encontrado[10],
    status: encontrado[11]
  };
}

function garantirFornecedorDoPedido_(ss, payload, registrosItens, numeroPedido) {
  const nome = textoOpcional_(payload && payload.fornecedor);
  if (!nome) return;
  const aba = ss.getSheetByName(CONFIG.ABAS.FORNECEDORES);
  if (!aba) return;
  garantirEstruturaFornecedoresPortal_(aba);

  const colunas = CONFIG.CABECALHOS.FORNECEDORES.length;
  const quantidade = Math.max(aba.getLastRow() - 1, 0);
  const dados = quantidade ? aba.getRange(2, 1, quantidade, colunas).getValues() : [];
  const indice = dados.findIndex(function(linha) {
    return normalizar_(linha[2]) === normalizar_(nome) || normalizar_(linha[3]) === normalizar_(nome);
  });
  const centros = {};
  (registrosItens || []).forEach(function(linha) { incrementarFrequencia_(centros, linha[8]); });
  const centro = valorMaisFrequente_(centros) || inferirCentroCustoHistorico_(payload.categoria, nome);
  const agora = new Date();
  const usuario = obterUsuarioAtual_();

  if (indice >= 0) {
    const linha = dados[indice].slice();
    let alterado = false;
    if (!textoOpcional_(linha[7]) && textoOpcional_(payload.categoria)) { linha[7] = payload.categoria; alterado = true; }
    if (!textoOpcional_(linha[8]) && textoOpcional_(payload.naturezaOperacao)) { linha[8] = payload.naturezaOperacao; alterado = true; }
    if (!textoOpcional_(linha[9]) && textoOpcional_(payload.metodoPagamento)) { linha[9] = payload.metodoPagamento; alterado = true; }
    if (!textoOpcional_(linha[10]) && centro) { linha[10] = centro; alterado = true; }
    if (alterado) {
      linha[13] = agora;
      linha[14] = usuario;
      aba.getRange(indice + 2, 1, 1, colunas).setValues([linha]);
    }
    return;
  }

  const linha = [
    gerarIdFornecedor_(), '', nome, nome, '', '', '',
    textoOpcional_(payload.categoria), textoOpcional_(payload.naturezaOperacao),
    textoOpcional_(payload.metodoPagamento), centro, 'Revisar',
    'Cadastro automatico a partir do pedido ' + numeroPedido + '. Confirmar CNPJ e dados de contato.',
    agora, usuario
  ];
  const destino = Math.max(aba.getLastRow() + 1, 2);
  if (destino > aba.getMaxRows()) aba.insertRowsAfter(aba.getMaxRows(), 1);
  aba.getRange(destino, 1, 1, colunas).setValues([linha]);
  aba.getRange(destino, 14).setNumberFormat('dd/MM/yyyy HH:mm');
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

function arredondarValorUnitario_(valor) {
  return Math.round((Number(valor) + Number.EPSILON) * 10000) / 10000;
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
