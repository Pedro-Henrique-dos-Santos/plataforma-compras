import { createHash } from 'node:crypto';

import { BadRequestException } from '@nestjs/common';
import { organizationDocumentSchema, type SheetSyncAction } from '@compras/contracts';

import type {
  ParsedSheetInstallment,
  ParsedSheetPayload,
  ParsedSheetPrice,
  ParsedSheetPurchase,
  ParsedSheetPurchaseItem,
  ParsedSheetSupplier,
  SheetTable,
  SheetWorkbook,
  StoredGoogleSheetsIntegration,
} from './sheet-sync.types.js';

type TableRow = {
  rowNumber: number;
  values: Map<string, unknown>;
};

type PurchaseDraft = Omit<ParsedSheetPurchase, 'items' | 'rowNumbers' | 'installments'> & {
  items: ParsedSheetPurchaseItem[];
  rowNumbers: number[];
};

type LegacyParseResult = {
  purchases: ParsedSheetPurchase[];
  sourceRows: number;
};

export function parseSheetWorkbook(
  workbook: SheetWorkbook,
  integration: StoredGoogleSheetsIntegration,
): ParsedSheetPayload {
  const suppliersTable = requiredTable(workbook, integration.suppliersSheetName);
  const pricesTable = requiredTable(workbook, integration.pricesSheetName);
  const itemsTable = requiredTable(workbook, integration.itemsSheetName);
  const installmentsTable = requiredTable(workbook, integration.installmentsSheetName);

  const issues: SheetSyncAction[] = [];
  const warnings: string[] = [];
  const suppliers = parseSuppliers(suppliersTable, integration.headerRow, issues);
  const supplierDocuments = new Map(
    suppliers.flatMap((supplier) => {
      const names = [supplier.legalName, supplier.tradeName].filter(
        (name): name is string => Boolean(name),
      );
      return names.map((name) => [normalizeText(name), supplier.document] as const);
    }),
  );
  const prices = parsePrices(pricesTable, integration.headerRow, issues);
  const installments = parseInstallments(
    installmentsTable,
    integration.headerRow,
    issues,
  );
  const purchases = parsePurchases(
    itemsTable,
    integration.headerRow,
    installments,
    supplierDocuments,
    issues,
    warnings,
  );
  const legacy = optionalTable(workbook, 'valores negociados');
  const legacyResult = legacy
    ? parseLegacyPurchases(
        legacy,
        integration.headerRow,
        suppliers,
        purchases,
        issues,
        warnings,
      )
    : { purchases: [], sourceRows: 0 };

  return {
    sourceRows:
      countContentRows(suppliersTable) +
      countContentRows(pricesTable) +
      countContentRows(itemsTable) +
      countContentRows(installmentsTable) +
      legacyResult.sourceRows,
    suppliers,
    prices,
    purchases: [...purchases, ...legacyResult.purchases],
    issues,
    warnings,
  };
}

function parseSuppliers(
  table: SheetTable,
  headerRow: number,
  issues: SheetSyncAction[],
): ParsedSheetSupplier[] {
  const rows = tableRows(table, headerRow);
  assertHeaders(rows.headers, table.name, [
    ['razao social', 'fornecedor', 'prestador de servicos'],
  ]);
  const byKey = new Map<string, ParsedSheetSupplier>();
  for (const row of rows.data) {
    const legalName = textCell(row, ['razao social', 'fornecedor', 'prestador de servicos']);
    const document = documentCell(row, ['cnpj do fornecedor', 'cnpj', 'documento']);
    if (!legalName) {
      if (hasContent(row)) {
        issues.push(invalidAction('SUPPLIER', row.rowNumber, 'Fornecedor sem razao social.'));
      }
      continue;
    }
    const externalId = textCell(row, ['id do fornecedor', 'id fornecedor']);
    const sourceKey = externalId || document || normalizeText(legalName);
    const supplier: ParsedSheetSupplier = {
      sourceKey,
      rowNumber: row.rowNumber,
      externalId,
      document,
      legalName,
      tradeName: textCell(row, ['nome comercial', 'nome fantasia']),
      email: emailCell(row, ['e mail', 'email']),
      phone: textCell(row, ['telefone', 'celular']),
      category: textCell(row, ['categoria padrao', 'categoria']),
      operationNature: textCell(row, [
        'natureza da operacao padrao',
        'natureza da operacao',
      ]),
      paymentMethod: textCell(row, [
        'metodo de pagamento padrao',
        'metodo de pagamento',
      ]),
      costCenterName: textCell(row, ['centro de custo padrao', 'centro de custo']),
      notes: textCell(row, ['observacoes', 'observacao']),
      active: normalizeText(textCell(row, ['status']) ?? 'ativo') !== 'inativo',
    };
    const previous = byKey.get(sourceKey);
    if (previous) {
      issues.push({
        key: `supplier:${sourceKey}:duplicate:${row.rowNumber}`,
        entity: 'SUPPLIER',
        action: 'INVALID',
        rowNumbers: [previous.rowNumber, row.rowNumber],
        label: legalName,
        reason: 'Fornecedor repetido na propria planilha.',
        amount: null,
      });
      continue;
    }
    byKey.set(sourceKey, supplier);
  }
  return [...byKey.values()];
}

function parsePrices(
  table: SheetTable,
  headerRow: number,
  issues: SheetSyncAction[],
): ParsedSheetPrice[] {
  const rows = tableRows(table, headerRow);
  assertHeaders(rows.headers, table.name, [
    ['fornecedor', 'razao social'],
    ['item padronizado', 'item', 'descricao'],
    ['valor unitario negociado', 'valor negociado'],
  ]);
  const prices: ParsedSheetPrice[] = [];
  for (const row of rows.data) {
    const supplierName = textCell(row, ['fornecedor', 'razao social']);
    const description = textCell(row, ['item padronizado', 'item', 'descricao']);
    const negotiatedPrice = numberCell(row, [
      'valor unitario negociado',
      'valor negociado',
    ]);
    if (!supplierName && !description && negotiatedPrice === null) {
      continue;
    }
    if (!supplierName || !description || negotiatedPrice === null || negotiatedPrice < 0) {
      issues.push(
        invalidAction(
          'PRICE',
          row.rowNumber,
          'Preco sem fornecedor, item ou valor negociado valido.',
        ),
      );
      continue;
    }
    const externalId = textCell(row, ['id do preco', 'codigo do item', 'id']);
    const unit = textCell(row, ['unidade de medida', 'unidade']);
    const sourceKey =
      externalId || shortHash(`${normalizeText(supplierName)}|${normalizeText(description)}|${unit ?? ''}`);
    prices.push({
      sourceKey,
      rowNumber: row.rowNumber,
      supplierName,
      supplierDocument: documentCell(row, ['cnpj', 'cnpj do fornecedor']),
      itemCode: externalId,
      description,
      unit,
      initialPrice: numberCell(row, ['valor unitario inicial', 'valor inicial']),
      negotiatedPrice,
      category: textCell(row, ['categoria']),
      costCenterName: textCell(row, ['centro de custo']),
      validFrom: dateCell(row, ['vigencia inicial', 'data inicial']),
      validUntil: dateCell(row, ['vigencia final', 'data final']),
      notes: textCell(row, ['observacoes', 'observacao', 'condicao negociada']),
      active: normalizeText(textCell(row, ['status']) ?? 'ativo') !== 'inativo',
    });
  }
  return prices;
}

function parseInstallments(
  table: SheetTable,
  headerRow: number,
  issues: SheetSyncAction[],
): Map<string, ParsedSheetInstallment[]> {
  const rows = tableRows(table, headerRow);
  assertHeaders(rows.headers, table.name, [
    ['numero do pedido', 'pedido'],
    ['data de vencimento', 'vencimento'],
    ['valor da parcela', 'valor'],
  ]);
  const result = new Map<string, ParsedSheetInstallment[]>();
  for (const row of rows.data) {
    const number = textCell(row, ['numero do pedido', 'pedido']);
    const dueDate = dateCell(row, ['data de vencimento', 'vencimento']);
    const amount = numberCell(row, ['valor da parcela', 'valor']);
    if (!number && !dueDate && amount === null) {
      continue;
    }
    if (!number || !dueDate || amount === null || amount <= 0) {
      issues.push(
        invalidAction(
          'PURCHASE',
          row.rowNumber,
          'Parcela sem pedido, vencimento ou valor valido. A compra podera ser importada sem parcelas.',
        ),
      );
      continue;
    }
    const key = normalizeText(number);
    const values = result.get(key) ?? [];
    values.push({ rowNumber: row.rowNumber, dueDate, amount });
    result.set(key, values);
  }
  for (const values of result.values()) {
    values.sort((left, right) => left.dueDate.localeCompare(right.dueDate));
  }
  return result;
}

function parsePurchases(
  table: SheetTable,
  headerRow: number,
  installments: Map<string, ParsedSheetInstallment[]>,
  supplierDocuments: Map<string, string | null>,
  issues: SheetSyncAction[],
  warnings: string[],
): ParsedSheetPurchase[] {
  const rows = tableRows(table, headerRow);
  assertHeaders(rows.headers, table.name, [
    ['numero do pedido', 'pedido'],
    ['fornecedor', 'prestador de servicos'],
    ['data de emissao da nota fiscal', 'data de emissao', 'emissao'],
    ['item', 'descricao da compra'],
  ]);
  const drafts = new Map<string, PurchaseDraft>();
  for (const row of rows.data) {
    const status = normalizeText(textCell(row, ['status']) ?? '');
    if (status === 'cancelado' || status === 'cancelada') {
      issues.push({
        key: `purchase:cancelled:${row.rowNumber}`,
        entity: 'PURCHASE',
        action: 'SKIP_OUT_OF_SCOPE',
        rowNumbers: [row.rowNumber],
        label: textCell(row, ['numero do pedido', 'pedido']) ?? `Linha ${row.rowNumber}`,
        reason: 'Pedido cancelado na planilha de origem.',
        amount: null,
      });
      continue;
    }
    const supplierName = textCell(row, ['fornecedor', 'prestador de servicos']);
    const issuedAt = dateCell(row, [
      'data de emissao da nota fiscal',
      'data de emissao',
      'emissao',
    ]);
    const invoiceNumber = textCell(row, [
      'numero da nota fiscal',
      'nota fiscal',
      'numero da nota',
    ]);
    let number = textCell(row, ['numero do pedido', 'pedido']);
    const itemDescription = textCell(row, ['item', 'descricao da compra']);
    if (!supplierName && !issuedAt && !number && !itemDescription) {
      continue;
    }
    if (!number && supplierName && invoiceNumber) {
      number = `NF-${shortHash(`${normalizeText(supplierName)}|${invoiceNumber}`)}`.toUpperCase();
      warnings.push(
        `Linha ${row.rowNumber}: numero do pedido ausente; foi criada a chave estavel ${number}.`,
      );
    }
    const quantity = numberCell(row, ['quantidade']) ?? 1;
    const initialUnitPrice = numberCell(row, [
      'valor unitario inicial',
      'valor inicial',
    ]);
    const initialTotal = numberCell(row, ['valor total inicial']);
    const negotiatedUnitPrice = numberCell(row, [
      'valor unitario negociado',
      'valor negociado',
    ]);
    const negotiatedTotal = numberCell(row, ['valor total negociado']);
    const unitPrice =
      initialUnitPrice ?? (initialTotal !== null && quantity > 0 ? initialTotal / quantity : null);
    const finalUnitPrice =
      negotiatedUnitPrice ??
      (negotiatedTotal !== null && quantity > 0 ? negotiatedTotal / quantity : null) ??
      unitPrice;
    if (
      !number ||
      !supplierName ||
      !issuedAt ||
      !itemDescription ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      unitPrice === null ||
      finalUnitPrice === null ||
      unitPrice < 0 ||
      finalUnitPrice < 0
    ) {
      issues.push(
        invalidAction(
          'PURCHASE',
          row.rowNumber,
          'Item sem pedido, fornecedor, emissao, descricao, quantidade ou valor valido.',
        ),
      );
      continue;
    }
    const key = normalizeText(number);
    const existing = drafts.get(key);
    if (existing && normalizeText(existing.supplierName) !== normalizeText(supplierName)) {
      issues.push({
        key: `purchase:${key}:supplier-conflict`,
        entity: 'PURCHASE',
        action: 'INVALID',
        rowNumbers: [...existing.rowNumbers, row.rowNumber],
        label: number,
        reason: 'O mesmo pedido aparece com fornecedores diferentes.',
        amount: null,
      });
      drafts.delete(key);
      continue;
    }
    const item: ParsedSheetPurchaseItem = {
      rowNumber: row.rowNumber,
      description: itemDescription,
      quantity: round(quantity, 4),
      unit: textCell(row, ['unidade de medida', 'unidade']),
      unitPrice: round(unitPrice, 4),
      negotiatedPrice: round(finalUnitPrice, 4),
      costCenterName: textCell(row, ['centro de custo']),
    };
    if (existing) {
      existing.items.push(item);
      existing.rowNumbers.push(row.rowNumber);
      existing.invoiceNumber ||= invoiceNumber;
      continue;
    }
    drafts.set(key, {
      sourceKey: key,
      number,
      invoiceNumber,
      issuedAt,
      supplierName,
      supplierDocument: supplierDocuments.get(normalizeText(supplierName)) ?? null,
      category: textCell(row, ['categoria']),
      operationNature: textCell(row, ['natureza da operacao']),
      paymentMethod: textCell(row, ['metodo de pagamento']),
      notes: textCell(row, ['descricao geral da compra', 'descricao da compra']),
      items: [item],
      rowNumbers: [row.rowNumber],
    });
  }
  return [...drafts.values()].map((draft) => ({
    ...draft,
    installments: installments.get(draft.sourceKey) ?? [],
  }));
}

function parseLegacyPurchases(
  table: SheetTable,
  headerRow: number,
  suppliers: ParsedSheetSupplier[],
  normalizedPurchases: ParsedSheetPurchase[],
  issues: SheetSyncAction[],
  warnings: string[],
): LegacyParseResult {
  const rows = tableRows(table, headerRow);
  assertHeaders(rows.headers, table.name, [
    ['prestador de servicos', 'fornecedor', 'razao social'],
    ['descricao da compra', 'item', 'descricao'],
    ['valor negociado', 'valor total negociado'],
  ]);
  const supplierProfiles = new Map<string, ParsedSheetSupplier>();
  for (const supplier of suppliers) {
    supplierProfiles.set(normalizeText(supplier.legalName), supplier);
    if (supplier.tradeName) {
      supplierProfiles.set(normalizeText(supplier.tradeName), supplier);
    }
  }
  const normalizedOrders = new Set(
    normalizedPurchases.map((purchase) => normalizeText(purchase.number)),
  );
  const normalizedInvoices = new Set(
    normalizedPurchases.flatMap((purchase) =>
      purchase.invoiceNumber
        ? [legacyInvoiceKey(purchase.supplierName, purchase.invoiceNumber)]
        : [],
    ),
  );
  const sourceKeys = new Set<string>();
  const purchases: ParsedSheetPurchase[] = [];
  let sourceRows = 0;

  for (const row of rows.data) {
    const supplierName = textCell(row, [
      'prestador de servicos',
      'fornecedor',
      'razao social',
    ]);
    const description = textCell(row, ['descricao da compra', 'item', 'descricao']);
    const number = textCell(row, ['numero do pedido', 'pedido']);
    const issuedAt = dateCell(row, ['data de emissao', 'emissao']);
    const invoiceNumber = textCell(row, [
      'documento',
      'numero da nota fiscal',
      'numero da nota',
    ]);
    const initialPrice = numberCell(row, ['valor inicial', 'valor total inicial']);
    const negotiatedPrice = numberCell(row, [
      'valor negociado',
      'valor total negociado',
    ]);
    const hasBusinessIdentity = Boolean(
      supplierName || description || number || issuedAt || invoiceNumber,
    );
    if (!hasBusinessIdentity) continue;
    sourceRows += 1;

    const normalizedNumber = normalizeText(number ?? '');
    const invoiceKey =
      supplierName && invoiceNumber
        ? legacyInvoiceKey(supplierName, invoiceNumber)
        : null;
    if (
      (normalizedNumber && normalizedOrders.has(normalizedNumber)) ||
      (invoiceKey && normalizedInvoices.has(invoiceKey))
    ) {
      issues.push({
        key: `purchase:legacy-duplicate:${row.rowNumber}`,
        entity: 'PURCHASE',
        action: 'SKIP_DUPLICATE',
        rowNumbers: [row.rowNumber],
        label: number ?? `${supplierName ?? 'Fornecedor'} | ${invoiceNumber ?? 'sem NF'}`,
        reason: 'Registro historico ja representado na aba normalizada de itens.',
        amount: negotiatedPrice,
      });
      continue;
    }
    if (!supplierName || !description || negotiatedPrice === null || negotiatedPrice < 0) {
      issues.push(
        invalidAction(
          'PURCHASE',
          row.rowNumber,
          'Compra historica sem fornecedor, descricao ou valor negociado valido.',
        ),
      );
      continue;
    }
    if (!issuedAt) {
      issues.push({
        ...invalidAction(
          'PURCHASE',
          row.rowNumber,
          'Compra historica sem data de emissao. Preencha a data na planilha para liberar a importacao.',
        ),
        label: `${supplierName} | ${description}`,
        amount: negotiatedPrice,
      });
      continue;
    }

    const stableNumber =
      number ??
      `LEG-${shortHash(
        [
          normalizeText(supplierName),
          issuedAt,
          normalizeText(invoiceNumber ?? ''),
          normalizeText(description),
          negotiatedPrice.toFixed(4),
        ].join('|'),
      ).toUpperCase()}`;
    const sourceKey = normalizeText(stableNumber);
    if (sourceKeys.has(sourceKey)) {
      issues.push({
        key: `purchase:legacy-repeated:${row.rowNumber}`,
        entity: 'PURCHASE',
        action: 'INVALID',
        rowNumbers: [row.rowNumber],
        label: stableNumber,
        reason: 'Compra repetida na propria aba historica.',
        amount: negotiatedPrice,
      });
      continue;
    }
    sourceKeys.add(sourceKey);

    const supplier = supplierProfiles.get(normalizeText(supplierName));
    const sourceUnit = textCell(row, ['unidade']);
    purchases.push({
      sourceKey,
      rowNumbers: [row.rowNumber],
      number: stableNumber,
      invoiceNumber,
      issuedAt,
      supplierName,
      supplierDocument: supplier?.document ?? null,
      category: textCell(row, ['categoria']) ?? supplier?.category ?? null,
      operationNature:
        textCell(row, ['natureza da operacao']) ?? supplier?.operationNature ?? null,
      paymentMethod: textCell(row, ['metodo de pagamento']),
      notes: sourceUnit
        ? `${description} Unidade de origem: ${sourceUnit}.`
        : description,
      items: [
        {
          rowNumber: row.rowNumber,
          description,
          quantity: 1,
          unit: null,
          unitPrice: initialPrice ?? negotiatedPrice,
          negotiatedPrice,
          costCenterName: supplier?.costCenterName ?? null,
        },
      ],
      installments: [],
    });
  }

  if (purchases.length) {
    warnings.push(
      `${purchases.length} compras da aba historica foram convertidas com quantidade 1 e centro de custo herdado do fornecedor.`,
    );
  }
  return { purchases, sourceRows };
}

function requiredTable(workbook: SheetWorkbook, name: string): SheetTable {
  const table = workbook.tables[name];
  if (!table) {
    throw new BadRequestException(`A aba ${name} nao foi retornada pelo Google Sheets.`);
  }
  return table;
}

function optionalTable(workbook: SheetWorkbook, name: string): SheetTable | null {
  const target = normalizeText(name);
  return (
    Object.values(workbook.tables).find(
      (table) => normalizeText(table.name) === target,
    ) ?? null
  );
}

function tableRows(
  table: SheetTable,
  headerRow: number,
): { headers: Set<string>; data: TableRow[] } {
  const [rawHeaders = [], ...rawRows] = table.values;
  const headers = rawHeaders.map((value) => normalizeText(stringValue(value)));
  const headerSet = new Set(headers.filter(Boolean));
  const data = rawRows.map((values, index) => {
    const mapped = new Map<string, unknown>();
    headers.forEach((header, column) => {
      if (header) mapped.set(header, values[column]);
    });
    return { rowNumber: headerRow + index + 1, values: mapped };
  });
  return { headers: headerSet, data };
}

function assertHeaders(headers: Set<string>, sheetName: string, groups: string[][]): void {
  const missing = groups.filter(
    (aliases) => !aliases.some((alias) => headers.has(normalizeText(alias))),
  );
  if (missing.length) {
    throw new BadRequestException(
      `A aba ${sheetName} nao possui as colunas obrigatorias: ${missing
        .map((aliases) => aliases[0])
        .join(', ')}.`,
    );
  }
}

function textCell(row: TableRow, aliases: string[]): string | null {
  for (const alias of aliases) {
    const value = stringValue(row.values.get(normalizeText(alias))).trim();
    if (value) return value;
  }
  return null;
}

function numberCell(row: TableRow, aliases: string[]): number | null {
  for (const alias of aliases) {
    const value = row.values.get(normalizeText(alias));
    const parsed = parseLocaleNumber(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function dateCell(row: TableRow, aliases: string[]): string | null {
  for (const alias of aliases) {
    const parsed = parseBrazilianDate(row.values.get(normalizeText(alias)));
    if (parsed) return parsed;
  }
  return null;
}

function documentCell(row: TableRow, aliases: string[]): string | null {
  const value = textCell(row, aliases)?.replace(/\D/g, '') ?? '';
  const parsed = organizationDocumentSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function emailCell(row: TableRow, aliases: string[]): string | null {
  const value = textCell(row, aliases)?.toLowerCase() ?? '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : null;
}

function hasContent(row: TableRow): boolean {
  return [...row.values.values()].some((value) => stringValue(value).trim());
}

function countContentRows(table: SheetTable): number {
  return table.values
    .slice(1)
    .filter((row) => row.some((value) => stringValue(value).trim())).length;
}

function legacyInvoiceKey(supplierName: string, invoiceNumber: string): string {
  return `${normalizeText(supplierName)}|${normalizeText(invoiceNumber)}`;
}

function invalidAction(
  entity: SheetSyncAction['entity'],
  rowNumber: number,
  reason: string,
): SheetSyncAction {
  return {
    key: `${entity.toLowerCase()}:invalid:${rowNumber}`,
    entity,
    action: 'INVALID',
    rowNumbers: [rowNumber],
    label: `Linha ${rowNumber}`,
    reason,
    amount: null,
  };
}

export function parseLocaleNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  const raw = stringValue(value).trim();
  if (!raw) return null;
  const negative = /^\s*\(/.test(raw) || /^\s*-/.test(raw);
  const cleaned = raw.replace(/[^0-9,.-]/g, '').replace(/(?!^)-/g, '');
  if (!cleaned || cleaned === '-') return null;
  const comma = cleaned.lastIndexOf(',');
  const dot = cleaned.lastIndexOf('.');
  let normalized = cleaned;
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? ',' : '.';
    const thousands = decimal === ',' ? /\./g : /,/g;
    normalized = cleaned.replace(thousands, '').replace(decimal, '.');
  } else if (comma >= 0) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if ((cleaned.match(/\./g) ?? []).length > 1) {
    const parts = cleaned.split('.');
    const decimalPart = parts.at(-1) as string;
    normalized =
      decimalPart.length <= 2
        ? `${parts.slice(0, -1).join('')}.${decimalPart}`
        : parts.join('');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? (negative ? -Math.abs(parsed) : parsed) : null;
}

export function parseBrazilianDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString().slice(0, 10);
  }
  const raw = stringValue(value).trim();
  if (!raw) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  const brazilian = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(raw);
  const parts: [number, number, number] | null = iso
    ? [Number(iso[1]), Number(iso[2]), Number(iso[3])]
    : brazilian
      ? [Number(brazilian[3]), Number(brazilian[2]), Number(brazilian[1])]
      : null;
  if (!parts) return null;
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function costCenterCode(name: string): string {
  const slug = normalizeText(name).replace(/\s+/g, '-').toUpperCase().slice(0, 32);
  return `CC-${slug || shortHash(name).toUpperCase()}`;
}

function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

function stringValue(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
