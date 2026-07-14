const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('outputs/Codigo.gs', 'utf8');
let uuidCounter = 0;
const sandbox = {
  console,
  Utilities: {
    formatDate(date, _timezone, pattern) {
      const pad = (value) => String(value).padStart(2, '0');
      const values = {
        yyyy: date.getFullYear(),
        MM: pad(date.getMonth() + 1),
        dd: pad(date.getDate()),
        HH: pad(date.getHours()),
        mm: pad(date.getMinutes())
      };
      return pattern.replace(/yyyy|MM|dd|HH|mm/g, (token) => values[token]);
    },
    getUuid() {
      uuidCounter += 1;
      return String(uuidCounter).padStart(8, '0') + '-1234-1234-1234-123456789012';
    }
  }
};

vm.createContext(sandbox);
vm.runInContext(
  source + '\n;globalThis.__api = {' +
    'validarPrecoPortal_,' +
    'precoLinhaParaObjeto_,' +
    'resumirPrecos_,' +
    'intervalosSobrepostos_,' +
    'normalizarPalavrasChave_,' +
    'prepararRegistrosLotePrecos_,' +
    'comporObservacaoOrigemLote_,' +
    'existeConflitoPreco_,' +
    'extrairTextoRespostaOpenAI_,' +
    'normalizarAnaliseNotaPdf_,' +
    'normalizarDataIsoPdf_,' +
    'schemaNotaFiscalPdf_,' +
    'obterDadosDashboardPortal_,' +
    'inferirCentroCustoHistorico_,' +
    'valorMaisFrequente_' +
  '};',
  sandbox
);

const api = sandbox.__api;
const registro = api.validarPrecoPortal_({
  fornecedorId: 'FOR-TESTE',
  tipoAcordo: 'Contrato',
  itemPadronizado: 'Manutenção preventiva mensal',
  palavrasChave: 'manutenção, preventiva, manutenção',
  unidadeMedida: 'Mês',
  valorUnitarioInicial: '2800,00',
  valorUnitarioNegociado: '2300,00',
  vigenciaInicial: '2026-07-01',
  vigenciaFinal: '2027-06-30',
  status: 'Ativo'
});

assert.equal(registro.tipoAcordo, 'Contrato');
assert.equal(registro.valorUnitarioInicial, 2800);
assert.equal(registro.valorUnitarioNegociado, 2300);
assert.equal(registro.palavrasChave, 'manutenção, preventiva');
assert.equal(registro.status, 'Ativo');

const valorFracionado = api.validarPrecoPortal_({
  fornecedorId: 'FOR-TESTE',
  itemPadronizado: 'Dose fracionada',
  unidadeMedida: 'ML',
  valorUnitarioInicial: '0,03571',
  valorUnitarioNegociado: '0,03124',
  vigenciaInicial: '2026-07-01',
  status: 'Ativo'
});
assert.equal(valorFracionado.valorUnitarioInicial, 0.0357);
assert.equal(valorFracionado.valorUnitarioNegociado, 0.0312);

assert.throws(() => api.validarPrecoPortal_({
  fornecedorId: 'FOR-TESTE',
  itemPadronizado: 'Contrato inválido',
  unidadeMedida: 'Mês',
  valorUnitarioInicial: 100,
  valorUnitarioNegociado: 90,
  vigenciaInicial: '2026-12-31',
  vigenciaFinal: '2026-01-01',
  status: 'Ativo'
}), /vigência final/i);

const vencido = api.validarPrecoPortal_({
  fornecedorId: 'FOR-TESTE',
  itemPadronizado: 'Acordo expirado',
  unidadeMedida: 'Unidade',
  valorUnitarioInicial: 100,
  valorUnitarioNegociado: 80,
  vigenciaInicial: '2025-01-01',
  vigenciaFinal: '2025-12-31',
  status: 'Ativo'
});
assert.equal(vencido.status, 'Vencido');

const linha = [
  'Fornecedor antigo',
  '00.000.000/0000-00',
  'Luva nitrílica P',
  'luva, nitrílica',
  'Caixa',
  100,
  80,
  'Descartáveis',
  'Farmácia',
  'Pedido mínimo de 10 caixas',
  new Date(2026, 6, 1),
  new Date(2026, 11, 31),
  'Ativo',
  '',
  'Produto',
  'FOR-TESTE',
  'PRC-TESTE',
  new Date(2026, 6, 11, 10, 30),
  'Usuario TESTE'
];
const preco = api.precoLinhaParaObjeto_(linha, 2, {
  'FOR-TESTE': {
    id: 'FOR-TESTE',
    nomeComercial: 'Fornecedor atual',
    razaoSocial: '',
    cnpj: '11.111.111/0001-11'
  }
});

assert.equal(preco.fornecedor, 'Fornecedor atual');
assert.equal(preco.economiaValor, 20);
assert.equal(preco.economiaPercentual, 20);
assert.equal(preco.vigenciaInicial, '2026-07-01');

const resumo = api.resumirPrecos_([preco]);
assert.deepEqual(JSON.parse(JSON.stringify(resumo)), {
  total: 1,
  ativos: 1,
  vencendo: 0,
  atencao: 0,
  economiaMedia: 20
});

assert.equal(api.intervalosSobrepostos_(
  new Date(2026, 0, 1),
  new Date(2026, 5, 30),
  new Date(2026, 5, 1),
  new Date(2026, 11, 31)
), true);
assert.equal(api.intervalosSobrepostos_(
  new Date(2026, 0, 1),
  new Date(2026, 2, 31),
  new Date(2026, 3, 1),
  new Date(2026, 11, 31)
), false);

const fornecedorLote = {
  id: 'FOR-LOTE',
  cnpj: '11.222.333/0001-44',
  razaoSocial: 'Fornecedor do Lote LTDA',
  nomeComercial: 'Fornecedor do Lote',
  categoriaPadrao: 'Medicamento/produto injetável',
  centroCustoPadrao: 'Farmácia',
  status: 'Ativo'
};
const lote = api.prepararRegistrosLotePrecos_({
  fornecedorId: 'FOR-LOTE',
  tipoAcordo: 'Produto',
  vigenciaInicial: '2026-07-12',
  vigenciaFinal: '2027-07-11',
  status: 'Ativo',
  condicaoNegociada: 'Tabela válida por 12 meses',
  origem: {
    tipo: 'XML_NFE',
    arquivo: 'nfe-teste.xml',
    numeroNota: '12345'
  },
  itens: [
    {
      itemPadronizado: 'Luva nitrílica P',
      palavrasChave: 'luva nitrílica',
      unidadeMedida: 'Caixa',
      quantidadeReferencia: '10',
      valorUnitarioInicial: 38.9,
      valorUnitarioNegociado: 31.5,
      codigo: 'LUVA-P'
    },
    {
      itemPadronizado: 'Seringa 5 ml',
      palavrasChave: 'seringa 5 ml',
      unidadeMedida: 'Caixa',
      quantidadeReferencia: '4',
      valorUnitarioInicial: 29.9,
      valorUnitarioNegociado: 27.5,
      categoria: 'Descartáveis',
      codigo: 'SER-5'
    }
  ]
}, fornecedorLote, [], new Date(2026, 6, 12, 9, 30), 'Usuario TESTE');

assert.equal(lote.linhas.length, 2);
assert.equal(lote.linhas[0][7], 'Medicamento/produto injetável');
assert.equal(lote.linhas[0][8], 'Farmácia');
assert.equal(lote.linhas[1][7], 'Descartáveis');
assert.match(lote.linhas[0][13], /XML NF-e/);
assert.match(lote.linhas[0][13], /NF 12345/);
assert.notEqual(lote.linhas[0][16], lote.linhas[1][16]);

assert.throws(() => api.prepararRegistrosLotePrecos_({
  fornecedorId: 'FOR-LOTE',
  tipoAcordo: 'Produto',
  vigenciaInicial: '2026-07-12',
  status: 'Ativo',
  itens: [
    {
      itemPadronizado: 'Item duplicado',
      unidadeMedida: 'Unidade',
      valorUnitarioInicial: 10,
      valorUnitarioNegociado: 9
    },
    {
      itemPadronizado: 'Item duplicado',
      unidadeMedida: 'Unidade',
      valorUnitarioInicial: 10,
      valorUnitarioNegociado: 9
    }
  ]
}, fornecedorLote, [], new Date(2026, 6, 12), 'Usuario TESTE'), /Item 2: já existe um preço vigente/i);

const textoEstruturado = api.extrairTextoRespostaOpenAI_({
  output: [{
    content: [{
      type: 'output_text',
      text: '{"documentoFiscal":true}'
    }]
  }]
});
assert.equal(textoEstruturado, '{"documentoFiscal":true}');

assert.equal(api.normalizarDataIsoPdf_('2026-07-12T10:30:00-03:00'), '2026-07-12');
assert.equal(api.normalizarDataIsoPdf_('2026-02-31'), '');
assert.equal(api.normalizarDataIsoPdf_('12/07/2026'), '');

const analisePdf = api.normalizarAnaliseNotaPdf_({
  documentoFiscal: true,
  numeroNota: '9876',
  serie: '1',
  chaveAcesso: '1234567890',
  dataEmissao: '2026-07-12',
  fornecedor: {
    cnpj: '11.222.333/0001-44',
    razaoSocial: 'Fornecedor PDF LTDA',
    nomeFantasia: 'Fornecedor PDF'
  },
  valorTotal: 250,
  moeda: 'BRL',
  confiancaGeral: 'media',
  avisos: ['Conferir unidade do segundo item.'],
  itens: [{
    codigo: 'ABC-1',
    descricao: 'Luva de procedimento',
    quantidade: 10,
    unidade: 'CX',
    valorUnitario: 0,
    valorTotal: 250,
    ncm: '40151900',
    confianca: 'baixa'
  }]
}, 'nota-9876.pdf', 'gpt-5.6');

assert.equal(analisePdf.statusSugerido, 'Revisar');
assert.equal(analisePdf.itens.length, 1);
assert.equal(analisePdf.itens[0].valorUnitarioInicial, 25);
assert.equal(analisePdf.itens[0].confianca, 'baixa');
assert.match(analisePdf.itens[0].palavrasChave, /40151900/);
assert.equal(analisePdf.origem.tipo, 'PDF_IA');
assert.equal(analisePdf.origem.modelo, 'gpt-5.6');

const schemaPdf = api.schemaNotaFiscalPdf_();
assert.equal(schemaPdf.additionalProperties, false);
assert.equal(schemaPdf.properties.itens.items.additionalProperties, false);

assert.equal(
  api.inferirCentroCustoHistorico_('Medicamento/produto injetável', 'Fornecedor teste'),
  'Farmácia'
);
assert.equal(
  api.inferirCentroCustoHistorico_('Consumíveis de Tecnologia', 'Fornecedor teste'),
  'Tecnologia'
);
assert.equal(api.valorMaisFrequente_({ Farmácia: 3, Marketing: 1 }), 'Farmácia');

function fakeSheet(rows) {
  return {
    getLastRow() { return rows.length; },
    getRange(startRow, startColumn, rowCount, columnCount) {
      return {
        getValues() {
          return rows.slice(startRow - 1, startRow - 1 + rowCount).map((row) =>
            row.slice(startColumn - 1, startColumn - 1 + columnCount)
          );
        }
      };
    }
  };
}

const valoresDashboard = [
  Array.from({ length: 15 }),
  ['PED-1', 'Matriz', 'Comprador', 'Fornecedor A', 'Descartáveis', 'Compra A', 100, 80, 20, 0.2, 'Venda', 'PIX', new Date(2026, 0, 10), '', ''],
  ['PED-2', 'Health', 'Comprador', 'Fornecedor B', 'Consumo', 'Compra B', 200, 150, '', 0.25, 'Venda', 'Boleto', new Date(2026, 1, 11), '', '']
];
const rateiosDashboard = [
  Array.from({ length: 12 }),
  ['PED-1', new Date(2026, 0, 10), 2026, '01/2026', 'Matriz', 'Farmácia', 'Fornecedor A', 'Descartáveis', 80, 80, 1, 1]
];
const dashboard = api.obterDadosDashboardPortal_({
  getSheetByName(name) {
    if (name === 'valores negociados') return fakeSheet(valoresDashboard);
    if (name === 'Rateio por Centro de Custo') return fakeSheet(rateiosDashboard);
    return null;
  }
});

assert.equal(dashboard.registros.length, 2);
assert.equal(dashboard.registros[1].economia, 50);
assert.equal(dashboard.registros[0].competencia, '2026-01');
assert.equal(dashboard.rateios.length, 1);
assert.equal(dashboard.qualidade.linhasSemData, 0);

console.log('portal-precos.test.cjs: todos os testes passaram');
