import ExcelJS from 'exceljs';
import type { Row, Workbook } from 'exceljs';
import type {
  ProcurementReport,
  ProcurementReportBreakdown,
  ProcurementReportRow,
} from '@compras/contracts';

const MONEY_FORMAT = 'R$ #,##0.00';
const PERCENTAGE_FORMAT = '0.00%';

export async function buildProcurementWorkbook(report: ProcurementReport): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'E-Gestao Compras';
  workbook.company = 'E-Gestao Compras';
  workbook.created = new Date(report.generatedAt);
  workbook.modified = new Date(report.generatedAt);
  workbook.subject = `Relatorio de compras - ${report.period.label}`;
  workbook.title = 'Relatorio de compras';

  addSummarySheet(workbook, report);
  addPurchasesSheet(workbook, report.purchases);
  addBreakdownSheet(workbook, 'Departamentos', report.byDepartment);
  addBreakdownSheet(workbook, 'Fornecedores', report.bySupplier);
  addBreakdownSheet(workbook, 'Categorias', report.byCategory);
  addBreakdownSheet(workbook, 'Meses', report.byMonth);

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function addSummarySheet(workbook: Workbook, report: ProcurementReport): void {
  const sheet = workbook.addWorksheet('Resumo', {
    properties: { defaultRowHeight: 18 },
    views: [{ state: 'frozen', ySplit: 3 }],
  });
  sheet.columns = [
    { key: 'label', width: 28 },
    { key: 'value', width: 22 },
    { key: 'detail', width: 28 },
    { key: 'auxiliary', width: 18 },
  ];
  sheet.mergeCells('A1:D1');
  const title = sheet.getCell('A1');
  title.value = 'E-Gestao Compras - Relatorio de Compras';
  title.alignment = { horizontal: 'left', vertical: 'middle' };
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173F4F' } };
  title.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 16 };
  sheet.getRow(1).height = 34;

  sheet.getCell('A3').value = 'Periodo';
  sheet.getCell('B3').value = safeText(report.period.label);
  sheet.getCell('C3').value = 'Gerado em';
  sheet.getCell('D3').value = new Date(report.generatedAt);
  sheet.getCell('D3').numFmt = 'dd/mm/yyyy hh:mm';
  styleMetadataRow(sheet.getRow(3));

  const metrics: Array<[string, number, 'money' | 'percentage' | 'integer']> = [
    ['Valor comprado', report.totals.purchased, 'money'],
    ['Economia negociada', report.totals.negotiatedSavings, 'money'],
    ['Economia percentual', report.totals.savingsPercentage / 100, 'percentage'],
    ['Ticket medio', report.totals.averageTicket, 'money'],
    ['Quantidade de compras', report.totals.purchaseCount, 'integer'],
    ['Fornecedores distintos', report.totals.supplierCount, 'integer'],
  ];
  metrics.forEach(([label, value, kind], index) => {
    const row = sheet.getRow(index + 5);
    row.getCell(1).value = label;
    row.getCell(2).value = value;
    row.getCell(2).numFmt =
      kind === 'money' ? MONEY_FORMAT : kind === 'percentage' ? PERCENTAGE_FORMAT : '0';
    row.getCell(1).font = { bold: true, color: { argb: 'FF324D57' } };
    row.getCell(2).font = { bold: true, color: { argb: 'FF173F4F' } };
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F4' } };
    row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F4' } };
  });

  sheet.getCell('A12').value = 'Gastos por departamento';
  sheet.getCell('A12').font = { bold: true, color: { argb: 'FF173F4F' }, size: 12 };
  const departmentHeader = sheet.getRow(13);
  departmentHeader.values = ['Departamento', 'Compras', 'Gasto', 'Economia'];
  styleHeader(departmentHeader);
  report.byDepartment.forEach((entry) => {
    const row = sheet.addRow([
      safeText(entry.label),
      entry.purchaseCount,
      entry.total,
      entry.savings,
    ]);
    row.getCell(2).numFmt = '0';
    row.getCell(3).numFmt = MONEY_FORMAT;
    row.getCell(4).numFmt = MONEY_FORMAT;
  });
  sheet.autoFilter = {
    from: { column: 1, row: 13 },
    to: { column: 4, row: Math.max(13, 13 + report.byDepartment.length) },
  };
}

function addPurchasesSheet(workbook: Workbook, purchases: ProcurementReportRow[]): void {
  const sheet = workbook.addWorksheet('Compras', {
    properties: { defaultRowHeight: 18 },
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = [
    { header: 'Pedido', key: 'number', width: 18 },
    { header: 'Nota fiscal', key: 'invoice', width: 18 },
    { header: 'Data', key: 'issuedAt', width: 13 },
    { header: 'Fornecedor', key: 'supplier', width: 36 },
    { header: 'Categoria', key: 'category', width: 24 },
    { header: 'Departamentos', key: 'departments', width: 34 },
    { header: 'Origem', key: 'source', width: 18 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Itens', key: 'items', width: 10 },
    { header: 'Total', key: 'total', width: 16 },
    { header: 'Economia', key: 'savings', width: 16 },
  ];
  styleHeader(sheet.getRow(1));
  purchases.forEach((purchase) => {
    const row = sheet.addRow({
      number: safeText(purchase.number),
      invoice: safeText(purchase.invoiceNumber ?? ''),
      issuedAt: parseIsoDate(purchase.issuedAt),
      supplier: safeText(purchase.supplierName),
      category: safeText(purchase.category ?? ''),
      departments: safeText(purchase.departments.join(', ')),
      source: sourceLabel(purchase.source),
      status: statusLabel(purchase.status),
      items: purchase.itemCount,
      total: purchase.total,
      savings: purchase.negotiatedSavings,
    });
    row.getCell(3).numFmt = 'dd/mm/yyyy';
    row.getCell(9).numFmt = '0';
    row.getCell(10).numFmt = MONEY_FORMAT;
    row.getCell(11).numFmt = MONEY_FORMAT;
  });
  sheet.autoFilter = {
    from: { column: 1, row: 1 },
    to: { column: 11, row: Math.max(1, purchases.length + 1) },
  };
}

function addBreakdownSheet(
  workbook: Workbook,
  name: string,
  entries: ProcurementReportBreakdown[],
): void {
  const sheet = workbook.addWorksheet(name, {
    properties: { defaultRowHeight: 18 },
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = [
    { header: name === 'Meses' ? 'Mes' : name.slice(0, -1), key: 'label', width: 38 },
    { header: 'Compras', key: 'purchases', width: 14 },
    { header: 'Gasto', key: 'total', width: 18 },
    { header: 'Economia', key: 'savings', width: 18 },
  ];
  styleHeader(sheet.getRow(1));
  entries.forEach((entry) => {
    const row = sheet.addRow({
      label: safeText(entry.label),
      purchases: entry.purchaseCount,
      total: entry.total,
      savings: entry.savings,
    });
    row.getCell(2).numFmt = '0';
    row.getCell(3).numFmt = MONEY_FORMAT;
    row.getCell(4).numFmt = MONEY_FORMAT;
  });
  sheet.autoFilter = {
    from: { column: 1, row: 1 },
    to: { column: 4, row: Math.max(1, entries.length + 1) },
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

function styleMetadataRow(row: Row): void {
  row.eachCell((cell, column) => {
    cell.alignment = { vertical: 'middle' };
    if (column === 1 || column === 3) {
      cell.font = { bold: true, color: { argb: 'FF324D57' } };
    }
  });
}

function safeText(value: string): string {
  const normalized = value.replace(/[\r\n]+/g, ' ').trim();
  return /^[=+\-@]/.test(normalized) ? `'${normalized}` : normalized;
}

function parseIsoDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function sourceLabel(source: ProcurementReportRow['source']): string {
  return {
    MANUAL: 'Manual',
    CSV: 'CSV',
    INVOICE: 'Nota fiscal',
    GOOGLE_SHEETS: 'Google Sheets',
  }[source];
}

function statusLabel(status: ProcurementReportRow['status']): string {
  return {
    DRAFT: 'Rascunho',
    REGISTERED: 'Registrada',
    CANCELLED: 'Cancelada',
  }[status];
}
