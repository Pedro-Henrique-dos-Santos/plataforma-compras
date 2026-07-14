const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('outputs/Portal.html', 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
if (!match) throw new Error('Script principal do portal não encontrado.');

const sandbox = {
  console,
  document: {
    addEventListener() {}
  },
  window: {},
  Set,
  Map,
  Date,
  Number,
  String,
  Array,
  Object,
  Math,
  RegExp
};
vm.createContext(sandbox);
vm.runInContext(
  match[1] +
    '\n;globalThis.__portalApi = {' +
    'extrairDadosPdfGratuito,' +
    'numeroMonetarioPdf,' +
    'validarCnpjPdf,' +
    'extrairItensPdf,' +
    'pontuarTextoFiscalPdf,' +
    'formatarMoedaResumo,' +
    'opcoesGraficoDashboard,' +
    'opcoesGraficoPizzaDashboard,' +
    'limitarRotuloDashboard' +
    '};',
  sandbox
);

const api = sandbox.__portalApi;
assert.equal(api.numeroMonetarioPdf('R$ 1.234,56'), 1234.56);
assert.equal(api.numeroMonetarioPdf('25,0000'), 25);
assert.equal(api.formatarMoedaResumo(5705.0475), 'R$ 5.705,05');
assert.equal(Object.hasOwn(api.opcoesGraficoDashboard(false, true).scales.x.ticks, 'callback'), false);
assert.equal(Object.hasOwn(api.opcoesGraficoDashboard(true, true).scales.y.ticks, 'callback'), false);
assert.equal(api.opcoesGraficoDashboard(true, true).scales.x.ticks.maxTicksLimit, 4);
assert.equal(api.limitarRotuloDashboard('Fornecedor com nome muito longo para o gráfico', 30), 'Fornecedor com nome muito...');
const opcoesPizza = api.opcoesGraficoPizzaDashboard();
assert.equal(opcoesPizza.plugins.legend.position, 'bottom');
assert.equal(
  opcoesPizza.plugins.tooltip.callbacks.label({
    raw: 70,
    label: 'Matriz',
    dataset: { data: [70, 30] }
  }),
  'Matriz: R$ 70,00 (70%)'
);
assert.equal(api.pontuarTextoFiscalPdf('CNPJ Nota fiscal Valor total Fornecedor Descrição Quantidade '.repeat(3)) >= 5, true);

const leitura = {
  texto: [
    'DOCUMENTO FISCAL FICTICIO - SOMENTE TESTE',
    'Nota fiscal: 987654 | Serie: 1 | Emissao: 12/07/2026',
    'Fornecedor: FORNECEDOR TESTE LTDA',
    'CNPJ: 11.222.333/0001-44',
    'Codigo Descricao Qtd. Un. Valor unit. Valor total',
    'LUV-001 Luva nitrilica para procedimento 10 CX 25,00 250,00',
    'SER-005 Seringa descartavel 5 ml 4 CX 30,00 120,00',
    'Valor total da nota: R$ 370,00'
  ].join('\n'),
  linhas: [
    'DOCUMENTO FISCAL FICTICIO - SOMENTE TESTE',
    'Nota fiscal: 987654 | Serie: 1 | Emissao: 12/07/2026',
    'Fornecedor: FORNECEDOR TESTE LTDA',
    'CNPJ: 11.222.333/0001-44',
    'Codigo Descricao Qtd. Un. Valor unit. Valor total',
    'LUV-001 Luva nitrilica para procedimento 10 CX 25,00 250,00',
    'SER-005 Seringa descartavel 5 ml 4 CX 30,00 120,00',
    'Valor total da nota: R$ 370,00'
  ],
  paginas: 1,
  usouOcr: false,
  avisos: []
};

const importacao = api.extrairDadosPdfGratuito(leitura, 'nota-ficticia.pdf');
assert.equal(importacao.statusSugerido, 'Revisar');
assert.equal(importacao.origem.tipo, 'PDF_OCR_GRATUITO');
assert.equal(importacao.origem.numeroNota, '987654');
assert.equal(importacao.origem.valorNota, 370);
assert.equal(importacao.itens.length, 2);
assert.equal(importacao.itens[0].itemPadronizado, 'Luva nitrilica para procedimento');
assert.equal(importacao.itens[0].quantidadeReferencia, '10');
assert.equal(importacao.itens[0].valorUnitarioInicial, 25);
assert.equal(importacao.itens[1].valorUnitarioInicial, 30);
assert.equal(importacao.itens.every((item) => item.confianca === 'alta'), true);

console.log('portal-dashboard-pdf.test.cjs: todos os testes passaram');
