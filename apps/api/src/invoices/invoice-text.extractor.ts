import type {
  InvoiceExtractionInstallment,
  InvoiceExtractionItem,
} from '@compras/contracts';

import {
  digits,
  finalizeExtraction,
  inferTriage,
  normalizeDocument,
  normalizeText,
  parseBrazilianMoney,
  parseFiscalDate,
  type InvoiceExtractionResult,
} from './invoice-extraction.utils.js';

export function extractInvoiceFromText(
  sourceText: string,
  parser: 'PDF_TEXT' | 'PDF_OCR',
): InvoiceExtractionResult {
  const text = sourceText.replace(/\r/g, '\n').replace(/\n{3,}/g, '\n\n');
  const lines = text
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const normalized = normalizeText(text);
  const documentType = /nfs-?e|nota fiscal de servicos/i.test(normalized)
    ? 'NFSE'
    : /nf-?e|danfe|chave de acesso/i.test(normalized)
      ? 'NFE'
      : 'UNKNOWN';
  const accessKey = findAccessKey(text);
  const invoiceNumber = findInvoiceNumber(lines);
  const supplierDocument = findSupplierDocument(lines);
  const supplierName = findSupplierName(lines, supplierDocument);
  const issuedAt = findDate(lines);
  const total = findTotal(lines);
  const items = extractItems(lines);
  const installments = extractInstallments(lines);
  const triage = inferTriage(text, documentType);
  const warnings: string[] = [];
  if (parser === 'PDF_OCR') {
    warnings.push('Leitura realizada por OCR; confira todos os campos antes de importar.');
  }

  const extraction = finalizeExtraction(
    {
      invoiceNumber,
      accessKey,
      issuedAt,
      supplierName,
      supplierDocument,
      total,
      category: null,
      operationNature: findLabeledValue(lines, [
        'natureza da operacao',
        'natureza operacao',
      ]),
      paymentMethod: findLabeledValue(lines, [
        'forma de pagamento',
        'meio de pagamento',
      ]),
      items,
      installments,
      triageStatus: triage.status,
      triageReason: triage.reason,
    },
    warnings,
  );
  return { extraction, parser, warnings: unique(warnings) };
}

function findAccessKey(text: string): string | null {
  const candidates = text.match(/(?:\d[\s.-]?){44}/g) ?? [];
  for (const candidate of candidates) {
    const value = digits(candidate);
    if (value.length === 44) return value;
  }
  return null;
}

function findInvoiceNumber(lines: string[]): string | null {
  const patterns = [
    /(?:n[uú]mero\s+da\s+nota|nota\s+fiscal\s+n[ºo°]?|nf-?e\s+n[ºo°]?|nfs-?e\s+n[ºo°]?|n[º°])\s*[:.-]?\s*(\d{1,12})/i,
    /\bnota\s*[:.-]?\s*(\d{1,12})\b/i,
  ];
  for (const line of lines) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match?.[1]) return match[1];
    }
  }
  return null;
}

function findSupplierDocument(lines: string[]): string | null {
  const labeled = lines.find((line) =>
    /(?:emitente|prestador|fornecedor|cnpj|cpf)/i.test(line),
  );
  const ordered = labeled ? [labeled, ...lines.filter((line) => line !== labeled)] : lines;
  for (const line of ordered) {
    const matches = line.match(/\b\d{2,3}[.\s]?\d{3}[.\s]?\d{3}[\/.\s-]?\d{2,4}[-.\s]?\d{2}\b/g) ?? [];
    for (const match of matches) {
      const document = normalizeDocument(match);
      if (document) return document;
    }
  }
  return null;
}

function findSupplierName(lines: string[], document: string | null): string | null {
  const labels = ['razao social', 'emitente', 'prestador', 'fornecedor'];
  for (let index = 0; index < lines.length; index += 1) {
    const normalized = normalizeText(lines[index] ?? '');
    if (!labels.some((label) => normalized.includes(label))) continue;
    const inline = lines[index]?.split(/[:|-]/).slice(1).join(' ').trim();
    if (inline && inline.length >= 3 && !normalizeDocument(inline)) return cleanName(inline);
    const next = lines[index + 1];
    if (next && next.length >= 3 && !normalizeDocument(next)) return cleanName(next);
  }
  if (document) {
    const index = lines.findIndex((line) => digits(line).includes(document));
    const previous = index > 0 ? lines[index - 1] : null;
    if (previous && previous.length >= 3 && !/cnpj|cpf/i.test(previous)) {
      return cleanName(previous);
    }
  }
  return null;
}

function findDate(lines: string[]): string | null {
  const preferred = lines.filter((line) => /emiss[aã]o|emitida|data da nota/i.test(line));
  for (const line of [...preferred, ...lines]) {
    const date = parseFiscalDate(line);
    if (date) return date;
  }
  return null;
}

function findTotal(lines: string[]): number | null {
  const labels = [
    /valor total da nota/i,
    /valor total/i,
    /valor l[ií]quido/i,
    /total da nfs/i,
    /total a pagar/i,
  ];
  for (const label of labels) {
    const line = lines.find((candidate) => label.test(candidate));
    if (!line) continue;
    const values = moneyValues(line);
    if (values.length) return values.at(-1) ?? null;
  }
  return null;
}

function extractItems(lines: string[]): InvoiceExtractionItem[] {
  const items: InvoiceExtractionItem[] = [];
  for (const line of lines) {
    if (/descricao|quantidade|valor unit|valor total|chave de acesso|tributos/i.test(line)) continue;
    const columns = line
      .split(/\s{2,}|\t|\|/)
      .map((column) => column.trim())
      .filter(Boolean);
    if (columns.length < 4) continue;
    const total = parseBrazilianMoney(columns.at(-1));
    const unitPrice = parseBrazilianMoney(columns.at(-2));
    const quantity = parseBrazilianMoney(columns.at(-4));
    const unit = columns.at(-3) ?? null;
    const description = columns.slice(0, -4).join(' ').replace(/^\d+\s+/, '').trim();
    if (
      !description ||
      description.length < 3 ||
      total === null ||
      unitPrice === null ||
      quantity === null ||
      quantity <= 0
    ) {
      continue;
    }
    if (Math.abs(quantity * unitPrice - total) > Math.max(0.1, total * 0.02)) continue;
    items.push({
      description: description.slice(0, 500),
      quantity,
      unit: unit && /^[a-z]{1,10}$/i.test(unit) ? unit : null,
      unitPrice,
      total,
    });
  }
  return items.slice(0, 500);
}

function extractInstallments(lines: string[]): InvoiceExtractionInstallment[] {
  const installments: InvoiceExtractionInstallment[] = [];
  for (const line of lines) {
    if (!/vencimento|parcela|duplicata/i.test(line)) continue;
    const dueDate = parseFiscalDate(line);
    const values = moneyValues(line);
    const amount = values.at(-1);
    if (dueDate && amount && amount > 0) installments.push({ dueDate, amount });
  }
  return installments.slice(0, 120);
}

function findLabeledValue(lines: string[], labels: string[]): string | null {
  for (const line of lines) {
    const normalized = normalizeText(line);
    if (!labels.some((label) => normalized.includes(label))) continue;
    const value = line.split(/[:|-]/).slice(1).join(' ').trim();
    if (value) return value.slice(0, 100);
  }
  return null;
}

function moneyValues(line: string): number[] {
  return (line.match(/(?:R\$\s*)?-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2,4}|(?:R\$\s*)?-?\d+\.\d{2,4}/g) ?? [])
    .map(parseBrazilianMoney)
    .filter((value): value is number => value !== null);
}

function cleanName(value: string): string {
  return value.replace(/\b(?:cnpj|cpf)\b.*$/i, '').trim().slice(0, 160);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
