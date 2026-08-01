import type { ReceivablesReport } from '@compras/contracts';
import ExcelJS from 'exceljs';

const colors = {
  brand: '963743',
  dark: '292D30',
  danger: 'B42318',
  gold: 'B57A18',
  light: 'F6F7F8',
  line: 'DFE3E6',
  success: '19704A',
  white: 'FFFFFF',
};

export async function buildReceivablesWorkbook(
  report: ReceivablesReport,
  organizationName: string,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'E-Gestao Compras';
  workbook.created = new Date(report.generatedAt);
  workbook.modified = new Date(report.generatedAt);

  const summary = workbook.addWorksheet('Resumo', {
    views: [{ showGridLines: false }],
  });
  summary.columns = [
    { width: 28 },
    { width: 20 },
    { width: 28 },
    { width: 20 },
  ];
  summary.mergeCells('A1:D1');
  summary.getCell('A1').value = 'Relatorio de contas a receber';
  summary.getCell('A1').font = { bold: true, color: { argb: colors.white }, size: 16 };
  summary.getCell('A1').fill = fill(colors.dark);
  summary.getRow(1).height = 32;
  summary.mergeCells('A2:D2');
  summary.getCell('A2').value = safeText(
    `${organizationName} | Gerado em ${formatDateTime(report.generatedAt)}`,
  );
  summary.getCell('A2').font = { color: { argb: '68737A' }, size: 10 };
  const metrics = [
    ['Em aberto', report.totals.open, 'Vencido', report.totals.overdue],
    ['A receber em 30 dias', report.totals.dueIn30Days, 'Recebido', report.totals.received],
    ['Quantidade de registros', report.totals.rowCount, '', ''],
  ];
  metrics.forEach((values, index) => {
    const row = summary.getRow(index + 4);
    row.values = values;
    row.height = 28;
    [row.getCell(1), row.getCell(3)].forEach((cell) => {
      cell.font = { bold: true, color: { argb: '68737A' }, size: 9 };
      cell.fill = fill(colors.light);
    });
    [row.getCell(2), row.getCell(4)].forEach((cell) => {
      cell.font = { bold: true, color: { argb: colors.dark }, size: 11 };
      cell.numFmt = index === 2 ? '0' : 'R$ #,##0.00';
    });
    row.eachCell((cell) => {
      cell.border = border();
      cell.alignment = { vertical: 'middle' };
    });
  });

  const detail = workbook.addWorksheet('Contas a receber', {
    views: [{ state: 'frozen', ySplit: 3, showGridLines: false }],
  });
  const columns = [
    ['Cliente', 32],
    ['Documento', 18],
    ['Descricao', 34],
    ['Categoria', 22],
    ['Documento interno', 18],
    ['Nota fiscal', 16],
    ['Emissao', 14],
    ['Vencimento', 14],
    ['Previsao', 14],
    ['Status', 20],
    ['Valor', 16],
    ['Recebido', 16],
    ['Saldo', 16],
    ['Fonte', 14],
    ['Observacoes', 36],
    ['Baixas', 10],
  ] as const;
  detail.columns = columns.map(([header, width]) => ({ header, width }));
  detail.mergeCells('A1:P1');
  detail.getCell('A1').value = 'Contas a receber e previsao de entradas';
  detail.getCell('A1').font = { bold: true, color: { argb: colors.white }, size: 14 };
  detail.getCell('A1').fill = fill(colors.dark);
  detail.getRow(1).height = 30;
  detail.mergeCells('A2:P2');
  detail.getCell('A2').value = `Fonte: ${report.dataSource === 'DATABASE' ? 'Banco de dados' : 'Demonstracao'} | ${formatDateTime(report.generatedAt)}`;
  detail.getCell('A2').font = { color: { argb: '68737A' }, size: 9 };
  const header = detail.getRow(3);
  header.values = columns.map(([label]) => label);
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: colors.white }, size: 9 };
    cell.fill = fill(colors.brand);
  });

  for (const receivable of report.rows) {
    const row = detail.addRow([
      safeText(receivable.customerName),
      safeText(receivable.customerDocument ?? ''),
      safeText(receivable.description),
      safeText(receivable.category ?? ''),
      safeText(receivable.documentNumber ?? ''),
      safeText(receivable.invoiceNumber ?? ''),
      excelDate(receivable.issuedAt),
      excelDate(receivable.dueDate),
      excelDate(receivable.expectedAt),
      statusLabel(receivable),
      receivable.amount,
      receivable.receivedAmount,
      receivable.balance,
      sourceLabel(receivable.source),
      safeText(receivable.notes ?? ''),
      receivable.settlements.length,
    ]);
    [7, 8, 9].forEach((column) => {
      row.getCell(column).numFmt = 'dd/mm/yyyy';
    });
    [11, 12, 13].forEach((column) => {
      row.getCell(column).numFmt = 'R$ #,##0.00';
    });
    row.eachCell((cell) => {
      cell.border = border();
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
    row.getCell(10).font = {
      bold: true,
      color: {
        argb: receivable.overdue
          ? colors.danger
          : receivable.status === 'RECEIVED'
            ? colors.success
            : colors.gold,
      },
    };
  }
  if (!report.rows.length) {
    detail.addRow(['Nenhuma conta encontrada para os filtros informados.']);
    detail.mergeCells('A4:P4');
  }
  detail.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: Math.max(3, detail.rowCount), column: 16 },
  };

  const content = await workbook.xlsx.writeBuffer();
  return Buffer.from(content);
}

function statusLabel(receivable: ReceivablesReport['rows'][number]) {
  if (receivable.overdue) return 'Vencido';
  return {
    OPEN: 'Em aberto',
    PARTIALLY_RECEIVED: 'Recebido parcialmente',
    RECEIVED: 'Recebido',
    CANCELLED: 'Cancelado',
  }[receivable.status];
}

function sourceLabel(source: ReceivablesReport['rows'][number]['source']) {
  return {
    MANUAL: 'Manual',
    INVOICE: 'Nota fiscal',
    IMPORT: 'Importacao',
    SALE: 'Venda',
  }[source];
}

function excelDate(value: string | null) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value));
}

function safeText(value: string) {
  const normalized = value.replace(/[\r\n]+/g, ' ').trim();
  return /^[=+\-@]/.test(normalized) ? `'${normalized}` : normalized;
}

function fill(color: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
}

function border(): Partial<ExcelJS.Borders> {
  return { bottom: { style: 'thin', color: { argb: colors.line } } };
}
