/**
 * HUMAN CLINIC - CONTROLE DE COMPRAS
 * Patch Fase 1.1 + inicio Fase 2A
 *
 * Como usar:
 * 1. Fazer backup do projeto Apps Script atual.
 * 2. Colar este arquivo como um novo arquivo, por exemplo "Fase_1_1_2A.gs".
 * 3. Substituir no arquivo atual as funcoes marcadas como "SUBSTITUIR".
 * 4. Rodar prepararEstruturaFase2A() uma vez.
 *
 * Observacao:
 * Este arquivo evita apagar historico. As rotinas novas sao idempotentes.
 */

const HC_FASE2 = Object.freeze({
  ABAS: {
    FORNECEDORES: 'Cadastro de Fornecedores',
    PRECOS: 'Tabela de Preços Negociados',
    REGRAS: 'Regras de Classificação',
    CONFERENCIA: 'Conferência da Nota Fiscal',
    LOG: 'Log de Importações'
  },

  CABECALHOS: {
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
    ],

    PARCELAS_ATUALIZADO: [
      'Número do Pedido',
      'Número da Nota Fiscal',
      'Parcela',
      'Data de Vencimento',
      'Valor da Parcela',
      'Método de Pagamento',
      'Status'
    ]
  },

  STATUS: {
    CADASTRO: ['Ativo', 'Inativo', 'Revisar'],
    PRECO: ['Ativo', 'Vencido', 'Suspenso', 'Revisar'],
    ACAO_CONFERENCIA: ['Aprovar', 'Editar', 'Ignorar', 'Revisar'],
    STATUS_CONFERENCIA: ['Pendente', 'Aprovado', 'Ignorado', 'Erro'],
    LOG: ['Recebido', 'Lido', 'Pendente de Conferência', 'Erro', 'Importado']
  }
});

/**
 * Rode uma vez para estabilizar a fase atual e criar as abas de inteligencia.
 */
function prepararEstruturaFase2A() {
  prepararEstrutura();
  corrigirCabecalhoParcelasNoConfig_();
  prepararAbasInteligencia_();
  SpreadsheetApp.getActiveSpreadsheet()
    .toast('Fase 1.1/2A preparada com segurança.', 'Compras Human Clinic', 5);
}

function corrigirCabecalhoParcelasNoConfig_() {
  if (!CONFIG || !CONFIG.CABECALHOS || !CONFIG.CABECALHOS.PARCELAS) return;

  const cabecalhos = CONFIG.CABECALHOS.PARCELAS;
  const temStatus = cabecalhos.some(function(cabecalho) {
    return normalizar_(cabecalho) === normalizar_('Status');
  });

  if (!temStatus) cabecalhos.push('Status');
}

function prepararAbasInteligencia_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const planos = [
    {
      nome: HC_FASE2.ABAS.FORNECEDORES,
      cabecalhos: HC_FASE2.CABECALHOS.FORNECEDORES,
      largura: 180,
      validacoes: [{ coluna: 8, valores: HC_FASE2.STATUS.CADASTRO }]
    },
    {
      nome: HC_FASE2.ABAS.PRECOS,
      cabecalhos: HC_FASE2.CABECALHOS.PRECOS,
      largura: 170,
      validacoes: [{ coluna: 13, valores: HC_FASE2.STATUS.PRECO }]
    },
    {
      nome: HC_FASE2.ABAS.REGRAS,
      cabecalhos: HC_FASE2.CABECALHOS.REGRAS,
      largura: 190,
      validacoes: [{ coluna: 5, valores: HC_FASE2.STATUS.CADASTRO }]
    },
    {
      nome: HC_FASE2.ABAS.CONFERENCIA,
      cabecalhos: HC_FASE2.CABECALHOS.CONFERENCIA,
      largura: 165,
      validacoes: [
        { coluna: 18, valores: HC_FASE2.STATUS.ACAO_CONFERENCIA },
        { coluna: 19, valores: HC_FASE2.STATUS.STATUS_CONFERENCIA }
      ]
    },
    {
      nome: HC_FASE2.ABAS.LOG,
      cabecalhos: HC_FASE2.CABECALHOS.LOG,
      largura: 170,
      validacoes: [{ coluna: 8, valores: HC_FASE2.STATUS.LOG }]
    }
  ];

  planos.forEach(function(plano) {
    const aba = obterOuCriarAba_(ss, plano.nome);
    aplicarCabecalhoCompleto_(aba, plano.cabecalhos);
    formatarCabecalho_(aba, plano.cabecalhos.length);
    aba.setFrozenRows(1);
    ajustarLarguras_(aba, plano.cabecalhos.map(function() { return Math.round(plano.largura / 7); }));
    aplicarFiltroSeguro_(aba, plano.cabecalhos.length);
    aplicarValidacoesLista_(aba, plano.validacoes || []);
  });
}

function aplicarCabecalhoCompleto_(aba, cabecalhos) {
  const atual = aba.getRange(1, 1, 1, cabecalhos.length).getDisplayValues()[0];
  const vazio = atual.every(function(valor) { return !String(valor || '').trim(); });

  if (vazio) {
    aba.getRange(1, 1, 1, cabecalhos.length).setValues([cabecalhos]);
    return;
  }

  cabecalhos.forEach(function(cabecalho, indice) {
    const existente = String(atual[indice] || '').trim();
    if (!existente) aba.getRange(1, indice + 1).setValue(cabecalho);
  });
}

function aplicarFiltroSeguro_(aba, quantidadeColunas) {
  const filtro = aba.getFilter();
  if (filtro) return;
  aba.getRange(1, 1, Math.max(aba.getMaxRows(), 2), quantidadeColunas).createFilter();
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

/**
 * SUBSTITUIR a funcao localizarMaiorSequenciaDoAno_(ano) atual por esta.
 * Corrige CONFIG.PREFIXO -> CONFIG.PREFIXO_PEDIDO.
 */
function localizarMaiorSequenciaDoAno_(ano) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName(CONFIG.ABAS.ITENS);
  if (!aba || aba.getLastRow() < 2) return 0;

  const numeros = aba.getRange(2, 1, aba.getLastRow() - 1, 1).getDisplayValues().flat();
  const regex = new RegExp('^' + CONFIG.PREFIXO_PEDIDO + '-' + ano + '-(\\d+)$');

  return numeros.reduce(function(maior, numero) {
    const match = String(numero).trim().match(regex);
    return match ? Math.max(maior, Number(match[1])) : maior;
  }, 0);
}

/**
 * SUBSTITUIR a funcao garantirCabecalhoParcelas_(aba) atual por esta.
 * Ela passa a garantir a coluna Status.
 */
function garantirCabecalhoParcelas_(aba) {
  const cabecalhos = HC_FASE2.CABECALHOS.PARCELAS_ATUALIZADO;
  const primeiraLinha = aba
    .getRange(1, 1, 1, Math.max(aba.getLastColumn(), cabecalhos.length))
    .getDisplayValues()[0];

  const estaVazio = primeiraLinha.every(function(valor) {
    return !String(valor || '').trim();
  });

  if (estaVazio) {
    aba.getRange(1, 1, 1, cabecalhos.length).setValues([cabecalhos]);
    return;
  }

  if (normalizar_(primeiraLinha[1]) !== normalizar_('Número da Nota Fiscal')) {
    aba.insertColumnAfter(1);
  }

  aba.getRange(1, 1, 1, cabecalhos.length).setValues([cabecalhos]);
}

/**
 * SUBSTITUIR a funcao gravarParcelas_(ss, numeroPedido, payload) atual por esta.
 * Ela grava Status da parcela e preserva a regra de PIX.
 */
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
 * SUBSTITUIR a funcao adicionarParcelasPedido(payload) atual por esta.
 * Ela tambem grava Status.
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
  corrigirCabecalhoParcelasNoConfig_();

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

/**
 * SUBSTITUIR a funcao removerLinhasDoPedido_(aba, numeroPedido) atual por esta.
 * Remove apenas as linhas do pedido, de baixo para cima, sem reescrever a aba inteira.
 */
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

/**
 * Recalcula o resumo e o rateio de um pedido com base na aba Itens do Pedido.
 * Use para corrigir divergencias como resumo/rateio fora de sincronia.
 */
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

/**
 * Compara valores de Itens, resumo e parcelas.
 * Nao altera dados.
 */
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

/**
 * Busca fornecedor por CNPJ, razao social ou nome comercial.
 */
function buscarFornecedorInteligente(termo) {
  prepararAbasInteligencia_();

  const busca = normalizar_(termo);
  const cnpjBusca = normalizarCnpj_(termo);
  if (!busca && !cnpjBusca) return null;

  const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HC_FASE2.ABAS.FORNECEDORES);
  if (!aba || aba.getLastRow() < 2) return null;

  const dados = aba.getRange(2, 1, aba.getLastRow() - 1, HC_FASE2.CABECALHOS.FORNECEDORES.length).getValues();
  const encontrado = dados.find(function(linha) {
    const status = normalizar_(linha[7] || 'Ativo');
    if (status && status !== normalizar_('Ativo')) return false;

    return normalizarCnpj_(linha[0]) === cnpjBusca ||
      normalizar_(linha[1]).indexOf(busca) !== -1 ||
      normalizar_(linha[2]).indexOf(busca) !== -1;
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

/**
 * Busca preco negociado vigente por fornecedor + texto do item.
 */
function buscarPrecoNegociado(fornecedorOuCnpj, descricaoItem, dataReferencia) {
  prepararAbasInteligencia_();

  const fornecedorBusca = normalizar_(fornecedorOuCnpj);
  const cnpjBusca = normalizarCnpj_(fornecedorOuCnpj);
  const itemBusca = normalizar_(descricaoItem);
  const data = dataReferencia ? converterData_(dataReferencia) : new Date();

  const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HC_FASE2.ABAS.PRECOS);
  if (!aba || aba.getLastRow() < 2) return null;

  const dados = aba.getRange(2, 1, aba.getLastRow() - 1, HC_FASE2.CABECALHOS.PRECOS.length).getValues();
  const candidatos = dados.filter(function(linha) {
    const status = normalizar_(linha[12] || 'Ativo');
    if (status !== normalizar_('Ativo')) return false;

    const fornecedorOk = normalizar_(linha[0]).indexOf(fornecedorBusca) !== -1 ||
      normalizarCnpj_(linha[1]) === cnpjBusca;

    if (!fornecedorOk) return false;
    if (!vigenciaValida_(linha[10], linha[11], data)) return false;

    const palavras = String(linha[3] || linha[2] || '')
      .split(',')
      .map(function(valor) { return normalizar_(valor); })
      .filter(Boolean);

    return palavras.length > 0 && palavras.some(function(palavra) {
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

/**
 * Classifica item por palavra-chave usando a aba Regras de Classificacao.
 */
function classificarItemPorRegras(descricaoItem) {
  prepararAbasInteligencia_();

  const texto = normalizar_(descricaoItem);
  if (!texto) return null;

  const aba = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HC_FASE2.ABAS.REGRAS);
  if (!aba || aba.getLastRow() < 2) return null;

  const dados = aba.getRange(2, 1, aba.getLastRow() - 1, HC_FASE2.CABECALHOS.REGRAS.length).getValues();
  const candidatos = dados.filter(function(linha) {
    const status = normalizar_(linha[4] || 'Ativo');
    if (status !== normalizar_('Ativo')) return false;
    return texto.indexOf(normalizar_(linha[0])) !== -1;
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

function normalizarCnpj_(valor) {
  return String(valor || '').replace(/\D/g, '');
}
