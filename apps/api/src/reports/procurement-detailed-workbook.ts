import ExcelJS from 'exceljs';
import type { Row, Workbook, Worksheet } from 'exceljs';
import type {
  ProcurementDetailedPurchase,
  ProcurementDetailedReport,
  ProcurementDetailedSupplier,
} from '@compras/contracts';

import { addProcurementSummarySheets } from './procurement-workbook.js';

const MONEY_FORMAT = 'R$ #,##0.00';
const PERCENTAGE_FORMAT = '0.00%';

export async function buildDetailedProcurementWorkbook(
  report: ProcurementDetailedReport,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'E-Gestao Compras';
  workbook.company = 'E-Gestao Compras';
  workbook.created = new Date(report.summary.generatedAt);
  workbook.modified = new Date(report.summary.generatedAt);
  workbook.subject = `Relatorio detalhado de compras - ${report.summary.period.label}`;
  workbook.title = 'Relatorio detalhado de compras';

  addProcurementSummarySheets(workbook, report.summary);
  addDetailedPurchasesSheet(workbook, report.purchases);
  addItemsSheet(workbook, report.purchases);
  addMonthlyItemsSheet(workbook, report.purchases);
  addAllocationsSheet(workbook, report.purchases);
  addInstallmentsSheet(workbook, report.purchases);
  addInvoicesSheet(workbook, report.purchases);
  addSupplierDataSheet(workbook, report.purchases);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function addDetailedPurchasesSheet(
  workbook: Workbook,
  purchases: ProcurementDetailedPurchase[],
): void {
  const sheet = dataSheet(workbook, 'Compras detalhadas', [
    { header: 'Pedido', key: 'number', width: 20 },
    { header: 'Nota fiscal', key: 'invoice', width: 18 },
    { header: 'Emissao', key: 'issuedAt', width: 13 },
    { header: 'Fornecedor', key: 'supplier', width: 42 },
    { header: 'Razao social', key: 'legalName', width: 44 },
    { header: 'CNPJ', key: 'document', width: 20 },
    { header: 'Categoria', key: 'category', width: 28 },
    { header: 'Natureza da operacao', key: 'operationNature', width: 30 },
    { header: 'Pagamento', key: 'paymentMethod', width: 20 },
    { header: 'Origem', key: 'source', width: 18 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Etapa', key: 'workflowStage', width: 28 },
    { header: 'Itens', key: 'items', width: 10 },
    { header: 'Parcelas', key: 'installments', width: 10 },
    { header: 'Documentos', key: 'documents', width: 12 },
    { header: 'Total', key: 'total', width: 17 },
    { header: 'Economia', key: 'savings', width: 17 },
    { header: 'Observacoes', key: 'notes', width: 42 },
  ]);
  purchases.forEach((purchase) => {
    const row = sheet.addRow({
      number: safeText(purchase.number),
      invoice: safeText(purchase.invoiceNumber ?? ''),
      issuedAt: purchase.issuedAt ? isoDate(purchase.issuedAt) : 'Sem data',
      supplier: safeText(purchase.supplier.tradeName ?? purchase.supplier.legalName),
      legalName: safeText(purchase.supplier.legalName),
      document: safeText(purchase.supplier.document ?? ''),
      category: safeText(purchase.category ?? ''),
      operationNature: safeText(purchase.operationNature ?? ''),
      paymentMethod: safeText(purchase.paymentMethod ?? ''),
      source: sourceLabel(purchase.source),
      status: purchaseStatusLabel(purchase.status),
      workflowStage: workflowStageLabel(purchase.workflowStage),
      items: purchase.items.length,
      installments: purchase.installments.length,
      documents: purchase.invoices.length,
      total: purchase.total,
      savings: purchase.negotiatedSavings,
      notes: safeText(purchase.notes ?? ''),
    });
    row.getCell(3).numFmt = 'dd/mm/yyyy';
    row.getCell(13).numFmt = '0';
    row.getCell(14).numFmt = '0';
    row.getCell(15).numFmt = '0';
    row.getCell(16).numFmt = MONEY_FORMAT;
    row.getCell(17).numFmt = MONEY_FORMAT;
    wrapCells(row, [4, 5, 7, 8, 18]);
    if (purchase.notes || purchase.supplier.legalName.length > 44) row.height = 30;
  });
  finishSheet(sheet, 18);
}

function addItemsSheet(workbook: Workbook, purchases: ProcurementDetailedPurchase[]): void {
  const sheet = dataSheet(workbook, 'Itens detalhados', [
    { header: 'Pedido', key: 'number', width: 20 },
    { header: 'Nota fiscal', key: 'invoice', width: 18 },
    { header: 'Emissao', key: 'issuedAt', width: 13 },
    { header: 'Fornecedor', key: 'supplier', width: 40 },
    { header: 'Item', key: 'description', width: 52 },
    { header: 'Quantidade', key: 'quantity', width: 14 },
    { header: 'Unidade', key: 'unit', width: 12 },
    { header: 'Preco original', key: 'unitPrice', width: 17 },
    { header: 'Preco negociado', key: 'negotiatedPrice', width: 18 },
    { header: 'Total', key: 'total', width: 17 },
    { header: 'Economia', key: 'savings', width: 17 },
    { header: 'Centro de custo', key: 'costCenter', width: 34 },
    { header: 'Codigo do centro', key: 'costCenterCode', width: 18 },
    { header: 'Classificacao', key: 'classification', width: 18 },
  ]);
  purchases.forEach((purchase) => {
    purchase.items.forEach((item) => {
      const row = sheet.addRow({
        number: safeText(purchase.number),
        invoice: safeText(purchase.invoiceNumber ?? ''),
        issuedAt: purchase.issuedAt ? isoDate(purchase.issuedAt) : 'Sem data',
        supplier: safeText(purchase.supplier.tradeName ?? purchase.supplier.legalName),
        description: safeText(item.description),
        quantity: item.quantity,
        unit: safeText(item.unit ?? ''),
        unitPrice: item.unitPrice,
        negotiatedPrice: item.negotiatedPrice,
        total: item.total,
        savings: item.negotiatedSavings,
        costCenter: safeText(item.costCenter?.name ?? ''),
        costCenterCode: safeText(item.costCenter?.code ?? ''),
        classification: item.allocations.length
          ? `Rateado em ${item.allocations.length} centros`
          : item.costCenter
            ? 'Centro direto'
            : 'Nao classificado',
      });
      row.getCell(3).numFmt = 'dd/mm/yyyy';
      row.getCell(6).numFmt = '0.####';
      [8, 9, 10, 11].forEach((column) => {
        row.getCell(column).numFmt = MONEY_FORMAT;
      });
      wrapCells(row, [4, 5, 12, 14]);
      if (item.description.length > 50) row.height = 30;
    });
  });
  finishSheet(sheet, 14);
}

function addMonthlyItemsSheet(
  workbook: Workbook,
  purchases: ProcurementDetailedPurchase[],
): void {
  const sheet = dataSheet(workbook, 'Itens por mes', [
    { header: 'Mes', key: 'month', width: 16 },
    { header: 'Item', key: 'description', width: 54 },
    { header: 'Unidade', key: 'unit', width: 12 },
    { header: 'Quantidade', key: 'quantity', width: 15 },
    { header: 'Compras', key: 'purchases', width: 12 },
    { header: 'Fornecedores', key: 'suppliers', width: 14 },
    { header: 'Gasto', key: 'total', width: 18 },
    { header: 'Economia', key: 'savings', width: 18 },
    { header: 'Preco medio', key: 'averagePrice', width: 18 },
  ]);
  const groups = new Map<
    string,
    {
      month: string;
      monthKey: string;
      description: string;
      unit: string;
      quantity: number;
      purchases: Set<string>;
      suppliers: Set<string>;
      total: number;
      savings: number;
    }
  >();

  purchases.forEach((purchase) => {
    const monthKey = purchase.issuedAt?.slice(0, 7) ?? 'sem-data';
    const month = purchase.issuedAt ? monthLabel(monthKey) : 'Sem data';
    purchase.items.forEach((item) => {
      const key = `${monthKey}|${normalizedText(item.description)}|${normalizedText(item.unit ?? '')}`;
      const current = groups.get(key) ?? {
        month,
        monthKey,
        description: item.description,
        unit: item.unit ?? '',
        quantity: 0,
        purchases: new Set<string>(),
        suppliers: new Set<string>(),
        total: 0,
        savings: 0,
      };
      current.quantity += item.quantity;
      current.purchases.add(purchase.id);
      current.suppliers.add(purchase.supplier.id);
      current.total += item.total;
      current.savings += item.negotiatedSavings;
      groups.set(key, current);
    });
  });

  [...groups.values()]
    .sort(
      (left, right) =>
        left.monthKey.localeCompare(right.monthKey) ||
        left.description.localeCompare(right.description, 'pt-BR'),
    )
    .forEach((group) => {
      const row = sheet.addRow({
        month: group.month,
        description: safeText(group.description),
        unit: safeText(group.unit),
        quantity: group.quantity,
        purchases: group.purchases.size,
        suppliers: group.suppliers.size,
        total: roundMoney(group.total),
        savings: roundMoney(group.savings),
        averagePrice: group.quantity > 0 ? roundMoney(group.total / group.quantity) : 0,
      });
      row.getCell(4).numFmt = '0.####';
      row.getCell(5).numFmt = '0';
      row.getCell(6).numFmt = '0';
      [7, 8, 9].forEach((column) => {
        row.getCell(column).numFmt = MONEY_FORMAT;
      });
      wrapCells(row, [2]);
      if (group.description.length > 50) row.height = 30;
    });
  finishSheet(sheet, 9);
}

function addAllocationsSheet(
  workbook: Workbook,
  purchases: ProcurementDetailedPurchase[],
): void {
  const sheet = dataSheet(workbook, 'Rateios', [
    { header: 'Pedido', key: 'number', width: 20 },
    { header: 'Nota fiscal', key: 'invoice', width: 18 },
    { header: 'Fornecedor', key: 'supplier', width: 40 },
    { header: 'Item', key: 'description', width: 52 },
    { header: 'Codigo do centro', key: 'costCenterCode', width: 18 },
    { header: 'Centro de custo', key: 'costCenter', width: 34 },
    { header: 'Percentual', key: 'percentage', width: 15 },
    { header: 'Valor', key: 'amount', width: 17 },
  ]);
  purchases.forEach((purchase) => {
    purchase.items.forEach((item) => {
      item.allocations.forEach((allocation) => {
        const row = sheet.addRow({
          number: safeText(purchase.number),
          invoice: safeText(purchase.invoiceNumber ?? ''),
          supplier: safeText(purchase.supplier.tradeName ?? purchase.supplier.legalName),
          description: safeText(item.description),
          costCenterCode: safeText(allocation.costCenter.code),
          costCenter: safeText(allocation.costCenter.name),
          percentage: allocation.percentage / 100,
          amount: allocation.amount,
        });
        row.getCell(7).numFmt = PERCENTAGE_FORMAT;
        row.getCell(8).numFmt = MONEY_FORMAT;
        wrapCells(row, [3, 4, 6]);
      });
    });
  });
  finishSheet(sheet, 8);
}

function addInstallmentsSheet(
  workbook: Workbook,
  purchases: ProcurementDetailedPurchase[],
): void {
  const sheet = dataSheet(workbook, 'Parcelas', [
    { header: 'Pedido', key: 'number', width: 20 },
    { header: 'Nota fiscal', key: 'invoice', width: 18 },
    { header: 'Fornecedor', key: 'supplier', width: 42 },
    { header: 'Parcela', key: 'sequence', width: 12 },
    { header: 'Vencimento', key: 'dueDate', width: 15 },
    { header: 'Valor', key: 'amount', width: 17 },
    { header: 'Pago em', key: 'paidAt', width: 15 },
    { header: 'Situacao', key: 'paymentStatus', width: 16 },
  ]);
  purchases.forEach((purchase) => {
    purchase.installments.forEach((installment) => {
      const row = sheet.addRow({
        number: safeText(purchase.number),
        invoice: safeText(purchase.invoiceNumber ?? ''),
        supplier: safeText(purchase.supplier.tradeName ?? purchase.supplier.legalName),
        sequence: installment.sequence,
        dueDate: isoDate(installment.dueDate),
        amount: installment.amount,
        paidAt: installment.paidAt ? isoDate(installment.paidAt) : null,
        paymentStatus: installment.paidAt ? 'Paga' : 'Pendente',
      });
      row.getCell(4).numFmt = '0';
      row.getCell(5).numFmt = 'dd/mm/yyyy';
      row.getCell(6).numFmt = MONEY_FORMAT;
      row.getCell(7).numFmt = 'dd/mm/yyyy';
      wrapCells(row, [3]);
    });
  });
  finishSheet(sheet, 8);
}

function addInvoicesSheet(workbook: Workbook, purchases: ProcurementDetailedPurchase[]): void {
  const sheet = dataSheet(workbook, 'Notas fiscais', [
    { header: 'Pedido', key: 'number', width: 20 },
    { header: 'NF da compra', key: 'purchaseInvoice', width: 18 },
    { header: 'Fornecedor', key: 'supplier', width: 42 },
    { header: 'NF do documento', key: 'documentInvoice', width: 18 },
    { header: 'Chave de acesso', key: 'accessKey', width: 48 },
    { header: 'Arquivo', key: 'fileName', width: 42 },
    { header: 'Tipo', key: 'kind', width: 10 },
    { header: 'Leitor', key: 'parser', width: 22 },
    { header: 'Confianca', key: 'confidence', width: 13 },
    { header: 'Status', key: 'status', width: 18 },
    { header: 'Avisos', key: 'warnings', width: 11 },
    { header: 'Erros', key: 'errors', width: 11 },
    { header: 'Processado em', key: 'processedAt', width: 20 },
    { header: 'Revisado em', key: 'reviewedAt', width: 20 },
    { header: 'Importado em', key: 'importedAt', width: 20 },
  ]);
  purchases.forEach((purchase) => {
    purchase.invoices.forEach((invoice) => {
      const row = sheet.addRow({
        number: safeText(purchase.number),
        purchaseInvoice: safeText(purchase.invoiceNumber ?? ''),
        supplier: safeText(purchase.supplier.tradeName ?? purchase.supplier.legalName),
        documentInvoice: safeText(invoice.invoiceNumber ?? ''),
        accessKey: safeText(invoice.accessKey ?? ''),
        fileName: safeText(invoice.fileName),
        kind: invoice.kind,
        parser: safeText(invoice.parser ?? ''),
        confidence: invoice.confidence,
        status: invoiceStatusLabel(invoice.status),
        warnings: invoice.warningCount,
        errors: invoice.errorCount,
        processedAt: dateTime(invoice.processedAt),
        reviewedAt: dateTime(invoice.reviewedAt),
        importedAt: dateTime(invoice.importedAt),
      });
      row.getCell(9).numFmt = PERCENTAGE_FORMAT;
      row.getCell(11).numFmt = '0';
      row.getCell(12).numFmt = '0';
      [13, 14, 15].forEach((column) => {
        row.getCell(column).numFmt = 'dd/mm/yyyy hh:mm';
      });
      wrapCells(row, [3, 6, 8]);
    });
  });
  finishSheet(sheet, 15);
}

function addSupplierDataSheet(
  workbook: Workbook,
  purchases: ProcurementDetailedPurchase[],
): void {
  const sheet = dataSheet(workbook, 'Dados fornecedores', [
    { header: 'Fornecedor', key: 'supplier', width: 42 },
    { header: 'Razao social', key: 'legalName', width: 44 },
    { header: 'CNPJ', key: 'document', width: 20 },
    { header: 'Categoria', key: 'category', width: 28 },
    { header: 'Natureza da operacao', key: 'operationNature', width: 30 },
    { header: 'Pagamento', key: 'paymentMethod', width: 20 },
    { header: 'Centro padrao', key: 'costCenter', width: 34 },
    { header: 'Codigo do centro', key: 'costCenterCode', width: 18 },
    { header: 'E-mail', key: 'email', width: 34 },
    { header: 'Telefone', key: 'phone', width: 18 },
  ]);
  uniqueSuppliers(purchases).forEach((supplier) => {
    const row = sheet.addRow({
      supplier: safeText(supplier.tradeName ?? supplier.legalName),
      legalName: safeText(supplier.legalName),
      document: safeText(supplier.document ?? ''),
      category: safeText(supplier.category ?? ''),
      operationNature: safeText(supplier.operationNature ?? ''),
      paymentMethod: safeText(supplier.paymentMethod ?? ''),
      costCenter: safeText(supplier.defaultCostCenter?.name ?? ''),
      costCenterCode: safeText(supplier.defaultCostCenter?.code ?? ''),
      email: safeText(supplier.email ?? ''),
      phone: safeText(supplier.phone ?? ''),
    });
    wrapCells(row, [1, 2, 4, 5, 7, 9]);
    if (supplier.legalName.length > 44) row.height = 30;
  });
  finishSheet(sheet, 10);
}

function dataSheet(
  workbook: Workbook,
  name: string,
  columns: Array<{ header: string; key: string; width: number }>,
): Worksheet {
  const sheet = workbook.addWorksheet(name, {
    properties: { defaultRowHeight: 18 },
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = columns;
  styleHeader(sheet.getRow(1));
  return sheet;
}

function finishSheet(sheet: Worksheet, lastColumn: number): void {
  sheet.autoFilter = {
    from: { column: 1, row: 1 },
    to: { column: lastColumn, row: Math.max(1, sheet.rowCount) },
  };
}

function styleHeader(row: Row): void {
  row.height = 24;
  row.eachCell((cell) => {
    cell.alignment = { vertical: 'middle' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F5C66' } };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  });
}

function wrapCells(row: Row, columns: number[]): void {
  columns.forEach((column) => {
    row.getCell(column).alignment = { vertical: 'middle', wrapText: true };
  });
}

function uniqueSuppliers(
  purchases: ProcurementDetailedPurchase[],
): ProcurementDetailedSupplier[] {
  return [
    ...new Map(purchases.map((purchase) => [purchase.supplier.id, purchase.supplier])).values(),
  ].sort((left, right) => left.legalName.localeCompare(right.legalName, 'pt-BR'));
}

function safeText(value: string): string {
  const normalized = value.replace(/[\r\n]+/g, ' ').trim();
  return /^[=+\-@]/.test(normalized) ? `'${normalized}` : normalized;
}

function normalizedText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function monthLabel(value: string): string {
  const [year, month] = value.split('-');
  const names = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${names[Number(month) - 1] ?? month}/${year}`;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function isoDate(value: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function dateTime(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

function sourceLabel(source: ProcurementDetailedPurchase['source']): string {
  return {
    MANUAL: 'Manual',
    CSV: 'CSV',
    INVOICE: 'Nota fiscal',
    GOOGLE_SHEETS: 'Google Sheets',
  }[source];
}

function purchaseStatusLabel(status: ProcurementDetailedPurchase['status']): string {
  return {
    DRAFT: 'Rascunho',
    REGISTERED: 'Registrada',
    CANCELLED: 'Cancelada',
  }[status];
}

function workflowStageLabel(
  stage: ProcurementDetailedPurchase['workflowStage'],
): string {
  return {
    REGISTRATION: 'Registro',
    REQUESTED: 'Solicitacao',
    AWAITING_APPROVAL: 'Aguardando aprovacao',
    PURCHASE_ORDER: 'Pedido de compra',
    SUPPLIER_INVOICED: 'Faturado pelo fornecedor',
    RECEIVED: 'Recebido',
    COMPLETED: 'Concluido',
  }[stage];
}

function invoiceStatusLabel(
  status: ProcurementDetailedPurchase['invoices'][number]['status'],
): string {
  return {
    PROCESSING: 'Processando',
    REVIEW_REQUIRED: 'Revisao necessaria',
    READY: 'Pronta',
    OUT_OF_SCOPE: 'Fora do escopo',
    IMPORTING: 'Importando',
    IMPORTED: 'Importada',
    FAILED: 'Falha',
  }[status];
}
