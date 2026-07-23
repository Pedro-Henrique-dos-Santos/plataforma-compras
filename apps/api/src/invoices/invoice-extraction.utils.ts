import type {
  InvoiceExtraction,
  InvoiceExtractionItem,
  InvoiceTriageStatus,
} from '@compras/contracts';

export type InvoiceExtractionResult = {
  extraction: InvoiceExtraction;
  parser: string;
  warnings: string[];
};

export function digits(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).replace(/\D/g, '')
    : '';
}

export function normalizeDocument(value: unknown): string | null {
  const normalized = digits(value);
  if (normalized.length === 14 && isValidCnpj(normalized)) return normalized;
  if (normalized.length === 11 && isValidCpf(normalized)) return normalized;
  return null;
}

export function parseBrazilianMoney(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? roundMoney(value) : null;
  if (typeof value !== 'string') return null;
  const cleaned = value
    .replace(/R\$/gi, '')
    .replace(/\s/g, '')
    .replace(/[^\d,.-]/g, '');
  if (!cleaned) return null;
  const decimalSeparator = cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.') ? ',' : '.';
  const normalized =
    decimalSeparator === ','
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned.replace(/,/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? roundMoney(number) : null;
}

export function parseFiscalDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso && isCalendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  const brazilian = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (!brazilian) return null;
  const year = Number(brazilian[3]) < 100 ? 2000 + Number(brazilian[3]) : Number(brazilian[3]);
  const month = Number(brazilian[2]);
  const day = Number(brazilian[1]);
  if (!isCalendarDate(year, month, day)) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function inferTriage(
  text: string,
  documentType: 'NFE' | 'NFSE' | 'UNKNOWN',
): { reason: string | null; status: InvoiceTriageStatus } {
  const normalized = normalizeText(text);
  const inScopeTerms = [
    'manutencao',
    'transporte',
    'farmacia',
    'medicamento',
    'material',
    'limpeza',
    'locacao',
    'tecnologia',
    'laboratorio',
    'equipamento',
    'insumo',
  ];
  const personalServiceTerms = [
    'consulta medica',
    'honorarios medicos',
    'honorario medico',
    'plantao medico',
    'procedimento medico',
    'servicos medicos',
    'servico medico',
    'atendimento medico',
    'fisioterapia',
    'fonoaudiologia',
    'psicologia',
    'nutricionista',
    'enfermagem assistencial',
  ];
  const hasInScopeTerm = inScopeTerms.some((term) => normalized.includes(term));
  const hasPersonalService = personalServiceTerms.some((term) => normalized.includes(term));
  const hasNamedProfessional = /\b(?:dr|dra|medico|medica|profissional|paciente)\s+[a-z]{3,}(?:\s+[a-z]{2,})+/i.test(
    normalized,
  );
  if (documentType === 'NFSE' && (hasPersonalService || hasNamedProfessional)) {
    return {
      status: 'OUT_OF_SCOPE',
      reason: 'NFS-e indica servico pessoal ou profissional de saude fora do escopo de compras.',
    };
  }
  if (documentType === 'NFE' || hasInScopeTerm) {
    return { status: 'IN_SCOPE', reason: null };
  }
  return {
    status: 'REVIEW_REQUIRED',
    reason: 'O tipo de despesa precisa ser confirmado durante a conferencia.',
  };
}

export function finalizeExtraction(
  input: Omit<InvoiceExtraction, 'confidence'>,
  warnings: string[],
): InvoiceExtraction {
  const mutableWarnings = warnings;
  const items = withFallbackItem(input.items, input.total, input.invoiceNumber, mutableWarnings);
  const confidence = calculateConfidence({ ...input, items });
  if (!input.invoiceNumber) mutableWarnings.push('Numero da nota nao identificado.');
  if (!input.supplierName) mutableWarnings.push('Razao social do fornecedor nao identificada.');
  if (!input.supplierDocument) mutableWarnings.push('CNPJ ou CPF do fornecedor nao identificado.');
  if (!input.issuedAt) mutableWarnings.push('Data de emissao nao identificada.');
  if (input.total === null) mutableWarnings.push('Valor total da nota nao identificado.');
  return { ...input, items, confidence };
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function withFallbackItem(
  items: InvoiceExtractionItem[],
  total: number | null,
  invoiceNumber: string | null,
  warnings: string[],
): InvoiceExtractionItem[] {
  if (items.length || total === null || total <= 0) return items;
  warnings.push('Os itens nao foram separados; foi criado um item consolidado para revisao.');
  return [
    {
      description: invoiceNumber
        ? `Itens da nota fiscal ${invoiceNumber}`
        : 'Itens consolidados da nota fiscal',
      quantity: 1,
      unit: null,
      unitPrice: total,
      total,
    },
  ];
}

function calculateConfidence(
  extraction: Omit<InvoiceExtraction, 'confidence'>,
): number {
  const score =
    (extraction.invoiceNumber ? 0.15 : 0) +
    (extraction.supplierName ? 0.15 : 0) +
    (extraction.supplierDocument ? 0.2 : 0) +
    (extraction.issuedAt ? 0.15 : 0) +
    (extraction.total !== null ? 0.2 : 0) +
    (extraction.items.length ? 0.15 : 0);
  return Math.round(Math.min(1, score) * 100) / 100;
}

function isValidCnpj(value: string): boolean {
  if (!/^\d{14}$/.test(value) || /^(\d)\1+$/.test(value)) return false;
  const calculate = (length: number): number => {
    let weight = length - 7;
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(value[index]) * weight;
      weight = weight === 2 ? 9 : weight - 1;
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return calculate(12) === Number(value[12]) && calculate(13) === Number(value[13]);
}

function isValidCpf(value: string): boolean {
  if (!/^\d{11}$/.test(value) || /^(\d)\1+$/.test(value)) return false;
  const digit = (length: number): number => {
    const sum = value
      .slice(0, length)
      .split('')
      .reduce((total, current, index) => total + Number(current) * (length + 1 - index), 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return digit(9) === Number(value[9]) && digit(10) === Number(value[10]);
}

function isCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
