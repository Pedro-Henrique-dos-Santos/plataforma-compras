import type {
  InvoiceExtractionInstallment,
  InvoiceExtractionItem,
} from '@compras/contracts';
import { XMLParser } from 'fast-xml-parser';

import {
  digits,
  finalizeExtraction,
  inferTriage,
  normalizeDocument,
  parseBrazilianMoney,
  parseFiscalDate,
  type InvoiceExtractionResult,
} from './invoice-extraction.utils.js';

const parser = new XMLParser({
  attributeNamePrefix: '@_',
  ignoreAttributes: false,
  isArray: (tagName) => ['det', 'dup', 'detPag'].includes(stripNamespace(tagName)),
  parseAttributeValue: false,
  parseTagValue: false,
  processEntities: false,
  removeNSPrefix: true,
  trimValues: true,
});

export function parseInvoiceXml(buffer: Buffer): InvoiceExtractionResult {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const parsed = parser.parse(text) as unknown;
  const infNfe = findObjectByKey(parsed, 'infNFe');
  return infNfe ? parseNfe(infNfe, text) : parseNfse(parsed, text);
}

function parseNfe(infNfe: Record<string, unknown>, sourceText: string): InvoiceExtractionResult {
  const ide = childRecord(infNfe, 'ide');
  const emit = childRecord(infNfe, 'emit');
  const totalNode = childRecord(childRecord(infNfe, 'total'), 'ICMSTot');
  const serviceTotalNode = childRecord(childRecord(infNfe, 'total'), 'ISSQNtot');
  const invoiceNumber = textValue(ide['nNF']);
  const supplierDocument =
    normalizeDocument(emit['CNPJ']) ?? normalizeDocument(emit['CPF']);
  const supplierName = textValue(emit['xNome']) || textValue(emit['xFant']) || null;
  const total =
    parseBrazilianMoney(totalNode['vNF']) ??
    parseBrazilianMoney(serviceTotalNode['vServ']);
  const items = arrayValue(infNfe['det'])
    .map(parseNfeItem)
    .filter((item): item is InvoiceExtractionItem => Boolean(item));
  const installments = parseNfeInstallments(infNfe);
  const paymentMethod = parsePaymentMethod(infNfe);
  const accessKey = digits(textValue(infNfe['@_Id'])).slice(-44) || null;
  const triage = inferTriage(sourceText, 'NFE');
  const warnings: string[] = [];
  if (!items.length) warnings.push('Nenhum item estruturado foi encontrado no XML da NF-e.');
  const extraction = finalizeExtraction(
    {
      invoiceNumber: invoiceNumber || null,
      accessKey: accessKey?.length === 44 ? accessKey : null,
      issuedAt: parseFiscalDate(textValue(ide['dhEmi']) || textValue(ide['dEmi'])),
      supplierName,
      supplierDocument,
      total,
      category: null,
      operationNature: textValue(ide['natOp']) || null,
      paymentMethod,
      items,
      installments,
      triageStatus: triage.status,
      triageReason: triage.reason,
    },
    warnings,
  );
  return { extraction, parser: 'NFE_XML', warnings: unique(warnings) };
}

function parseNfse(parsed: unknown, sourceText: string): InvoiceExtractionResult {
  const invoiceNode =
    findObjectByKey(parsed, 'InfNfse') ??
    findObjectByKey(parsed, 'InfNFS-e') ??
    findObjectByKey(parsed, 'Nfse') ??
    asRecord(parsed);
  if (!invoiceNode) throw new Error('Estrutura XML de nota fiscal nao reconhecida.');
  const provider =
    findObjectByKey(invoiceNode, 'PrestadorServico') ??
    findObjectByKey(invoiceNode, 'Prestador') ??
    invoiceNode;
  const providerIdentity =
    findObjectByKey(provider, 'IdentificacaoPrestador') ?? provider;
  const values = findObjectByKey(invoiceNode, 'Valores') ?? invoiceNode;
  const service = findObjectByKey(invoiceNode, 'Servico') ?? invoiceNode;
  const description =
    firstTextByKeys(service, ['Discriminacao', 'Descricao', 'DescricaoServico']) ||
    firstTextByKeys(invoiceNode, ['Discriminacao', 'Descricao', 'DescricaoServico']);
  const total = parseBrazilianMoney(
    firstTextByKeys(values, [
      'ValorLiquidoNfse',
      'ValorLiquidoNFS-e',
      'ValorServicos',
      'ValorServico',
      'ValorNota',
    ]),
  );
  const invoiceNumber = firstTextByKeys(invoiceNode, [
    'NumeroNfse',
    'NumeroNFS-e',
    'Numero',
  ]);
  const supplierDocument = normalizeDocument(
    firstTextByKeys(providerIdentity, ['Cnpj', 'CNPJ', 'Cpf', 'CPF']),
  );
  const supplierName =
    firstTextByKeys(provider, ['RazaoSocial', 'NomeFantasia', 'Nome']) ||
    firstTextByKeys(invoiceNode, ['RazaoSocialPrestador', 'NomePrestador']);
  const issuedAt = parseFiscalDate(
    firstTextByKeys(invoiceNode, ['DataEmissao', 'DataEmissaoNfse', 'Competencia']),
  );
  const items: InvoiceExtractionItem[] =
    description && total !== null
      ? [
          {
            description: description.slice(0, 500),
            quantity: 1,
            unit: 'SERVICO',
            unitPrice: total,
            total,
          },
        ]
      : [];
  const triage = inferTriage(description || sourceText, 'NFSE');
  const warnings: string[] = [];
  if (!description) warnings.push('Descricao do servico nao identificada no XML da NFS-e.');
  const extraction = finalizeExtraction(
    {
      invoiceNumber: invoiceNumber || null,
      accessKey: null,
      issuedAt,
      supplierName: supplierName || null,
      supplierDocument,
      total,
      category: null,
      operationNature:
        firstTextByKeys(invoiceNode, ['NaturezaOperacao', 'ExigibilidadeISS']) || null,
      paymentMethod: null,
      items,
      installments: [],
      triageStatus: triage.status,
      triageReason: triage.reason,
    },
    warnings,
  );
  return { extraction, parser: 'NFSE_XML', warnings: unique(warnings) };
}

function parseNfeItem(value: unknown): InvoiceExtractionItem | null {
  const product = childRecord(asRecord(value), 'prod');
  const description = textValue(product['xProd']);
  const quantity = parseBrazilianMoney(product['qCom']);
  const unitPrice = parseBrazilianMoney(product['vUnCom']);
  const total = parseBrazilianMoney(product['vProd']);
  if (!description || quantity === null || quantity <= 0 || unitPrice === null || total === null) {
    return null;
  }
  return {
    description: description.slice(0, 500),
    quantity,
    unit: textValue(product['uCom']).slice(0, 30) || null,
    unitPrice,
    total,
  };
}

function parseNfeInstallments(infNfe: Record<string, unknown>): InvoiceExtractionInstallment[] {
  const billing = childRecord(infNfe, 'cobr');
  return arrayValue(billing['dup'])
    .map((value) => {
      const duplicate = asRecord(value) ?? {};
      const dueDate = parseFiscalDate(textValue(duplicate['dVenc']));
      const amount = parseBrazilianMoney(duplicate['vDup']);
      return dueDate && amount !== null && amount > 0 ? { dueDate, amount } : null;
    })
    .filter((item): item is InvoiceExtractionInstallment => Boolean(item))
    .slice(0, 120);
}

function parsePaymentMethod(infNfe: Record<string, unknown>): string | null {
  const payment = childRecord(infNfe, 'pag');
  const detail = asRecord(arrayValue(payment['detPag'])[0]) ?? {};
  const code = textValue(detail['tPag']);
  return (
    {
      '01': 'Dinheiro',
      '02': 'Cheque',
      '03': 'Cartao de credito',
      '04': 'Cartao de debito',
      '15': 'Boleto bancario',
      '16': 'Deposito bancario',
      '17': 'PIX',
      '18': 'Transferencia bancaria',
    }[code] ?? null
  );
}

function findObjectByKey(value: unknown, key: string, depth = 0): Record<string, unknown> | null {
  if (depth > 20) return null;
  const record = asRecord(value);
  if (!record) return null;
  for (const [candidateKey, candidateValue] of Object.entries(record)) {
    if (stripNamespace(candidateKey).toLowerCase() === key.toLowerCase()) {
      const candidate = asRecord(candidateValue);
      if (candidate) return candidate;
    }
  }
  for (const candidateValue of Object.values(record)) {
    if (Array.isArray(candidateValue)) {
      for (const item of candidateValue) {
        const found = findObjectByKey(item, key, depth + 1);
        if (found) return found;
      }
      continue;
    }
    const found = findObjectByKey(candidateValue, key, depth + 1);
    if (found) return found;
  }
  return null;
}

function firstTextByKeys(value: unknown, keys: string[]): string {
  const normalizedKeys = new Set(keys.map((key) => stripNamespace(key).toLowerCase()));
  const visit = (candidate: unknown, depth: number): string => {
    if (depth > 20) return '';
    const record = asRecord(candidate);
    if (!record) return '';
    for (const [key, current] of Object.entries(record)) {
      if (normalizedKeys.has(stripNamespace(key).toLowerCase())) {
        const text = textValue(current);
        if (text) return text;
      }
    }
    for (const current of Object.values(record)) {
      if (Array.isArray(current)) {
        for (const item of current) {
          const found = visit(item, depth + 1);
          if (found) return found;
        }
      } else {
        const found = visit(current, depth + 1);
        if (found) return found;
      }
    }
    return '';
  };
  return visit(value, 0);
}

function childRecord(
  value: Record<string, unknown> | null,
  key: string,
): Record<string, unknown> {
  return asRecord(value?.[key]) ?? {};
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function arrayValue(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

function textValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  return '';
}

function stripNamespace(value: string): string {
  return value.split(':').at(-1) ?? value;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
