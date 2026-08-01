import type { AccountsPayableReport } from '@compras/contracts';
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

export async function buildAccountsPayableWorkbook(
  report: AccountsPayableReport,
  organizationName: string,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'E-Gestao Compras';
  workbook.created = new Date(report.generatedAt);
  workbook.modified = new Date(report.generatedAt);
  workbook.calcProperties.fullCalcOnLoad = true;

  addSummarySheet(workbook, report, organizationName);
  addPayablesSheet(workbook, report);

  const content = await workbook.xlsx.writeBuffer();
  return Buffer.from(content);
}

function addSummarySheet(
  workbook: ExcelJS.Workbook,
  report: AccountsPayableReport,
  organizationName: string,
) {
  const sheet = workbook.addWorksheet('Resumo financeiro', {
    views: [{ showGridLines: false }],
  });
  sheet.columns = [
    { key: 'label', width: 30 },
    { key: 'value', width: 22 },
    { key: 'label2', width: 30 },
    { key: 'value2', width: 22 },
  ];
  sheet.mergeCells('A1:D1');
  sheet.getCell('A1').value = 'Relatorio de contas a pagar';
  sheet.getCell('A1').font = { bold: true, color: { argb: colors.white }, size: 16 };
  sheet.getCell('A1').fill = solidFill(colors.dark);
  sheet.getCell('A1').alignment = { vertical: 'middle' };
  sheet.getRow(1).height = 32;

  sheet.mergeCells('A2:D2');
  sheet.getCell('A2').value = safeText(
    `${organizationName} | Gerado em ${formatDateTime(report.generatedAt)}`,
  );
  sheet.getCell('A2').font = { color: { argb: '68737A' }, size: 10 };
  sheet.getRow(2).height = 22;

  const rows = [
    ['Em aberto', report.totals.open, 'Vencido', report.totals.overdue],
    [
      'Vence em ate 7 dias',
      report.totals.dueIn7Days,
      'Vence em ate 15 dias',
      report.totals.dueIn15Days,
    ],
    [
      'Vence em ate 30 dias',
      report.totals.dueIn30Days,
      'Pago',
      report.totals.paid,
    ],
    [
      'Sem vencimento',
      report.totals.unscheduled,
      'Quantidade de registros',
      report.totals.rowCount,
    ],
  ];
  rows.forEach((values, index) => {
    const row = sheet.getRow(index + 4);
    row.values = values;
    row.height = 28;
    for (const cell of [row.getCell(1), row.getCell(3)]) {
      cell.font = { bold: true, color: { argb: '68737A' }, size: 9 };
      cell.fill = solidFill(colors.light);
    }
    for (const [metricIndex, cell] of [row.getCell(2), row.getCell(4)].entries()) {
      cell.font = { bold: true, color: { argb: colors.dark }, size: 11 };
      cell.numFmt = index === 3 && metricIndex === 1 ? '0' : 'R$ #,##0.00';
    }
    row.eachCell((cell) => {
      cell.border = thinBorder();
      cell.alignment = { vertical: 'middle' };
    });
  });

  sheet.getCell('A10').value =
    'Os valores refletem as parcelas registradas no momento da exportacao.';
  sheet.mergeCells('A10:D10');
  sheet.getCell('A10').font = { color: { argb: '68737A' }, italic: true, size: 9 };
  sheet.pageSetup = {
    fitToPage: true,
    fitToWidth: 1,
    orientation: 'landscape',
    paperSize: 9,
  };
}

function addPayablesSheet(
  workbook: ExcelJS.Workbook,
  report: AccountsPayableReport,
) {
  const sheet = workbook.addWorksheet('Contas a pagar', {
    views: [{ state: 'frozen', ySplit: 3, showGridLines: false }],
  });
  const columns = [
    ['Pedido', 18],
    ['Nota fiscal', 16],
    ['Fornecedor', 34],
    ['Parcela', 10],
    ['Vencimento', 15],
    ['Status', 15],
    ['Canal', 18],
    ['Referencia', 34],
    ['Valor', 16],
    ['Pago em', 15],
    ['Etapa', 24],
    ['Observacoes', 38],
  ] as const;
  sheet.columns = columns.map(([header, width]) => ({ header, width }));
  sheet.mergeCells('A1:L1');
  sheet.getCell('A1').value = 'Contas a pagar e previsao de desembolso';
  sheet.getCell('A1').font = { bold: true, color: { argb: colors.white }, size: 14 };
  sheet.getCell('A1').fill = solidFill(colors.dark);
  sheet.getRow(1).height = 30;
  sheet.mergeCells('A2:L2');
  sheet.getCell('A2').value = `Fonte: ${report.dataSource === 'DATABASE' ? 'Banco de dados' : 'Demonstracao'} | ${formatDateTime(report.generatedAt)}`;
  sheet.getCell('A2').font = { color: { argb: '68737A' }, size: 9 };

  const header = sheet.getRow(3);
  header.values = columns.map(([label]) => label);
  header.height = 25;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: colors.white }, size: 9 };
    cell.fill = solidFill(colors.brand);
    cell.alignment = { vertical: 'middle' };
  });

  for (const payable of report.rows) {
    const row = sheet.addRow([
      safeText(payable.purchaseNumber),
      safeText(payable.invoiceNumber ?? ''),
      safeText(payable.supplierName),
      payable.sequence || null,
      excelDate(payable.dueDate),
      payableStatusLabel(payable.status),
      paymentChannelLabel(payable.paymentChannel),
      safeText(payable.paymentReference ?? ''),
      payable.amount,
      excelDate(payable.paidAt),
      workflowStageLabel(payable.workflowStage),
      safeText(payable.paymentNotes ?? ''),
    ]);
    row.getCell(5).numFmt = 'dd/mm/yyyy';
    row.getCell(9).numFmt = 'R$ #,##0.00';
    row.getCell(10).numFmt = 'dd/mm/yyyy';
    row.eachCell((cell) => {
      cell.border = thinBorder();
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
    const statusCell = row.getCell(6);
    statusCell.font = {
      bold: true,
      color: {
        argb:
          payable.status === 'PAID'
            ? colors.success
            : payable.status === 'OVERDUE'
              ? colors.danger
              : colors.gold,
      },
    };
  }
  if (!report.rows.length) {
    sheet.addRow(['Nenhuma conta encontrada para os filtros informados.']);
    sheet.mergeCells('A4:L4');
  }
  sheet.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: Math.max(3, sheet.rowCount), column: 12 },
  };
  sheet.pageSetup = {
    fitToPage: true,
    fitToWidth: 1,
    orientation: 'landscape',
    paperSize: 9,
  };
}

function solidFill(color: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
}

function thinBorder(): Partial<ExcelJS.Borders> {
  return {
    bottom: { style: 'thin', color: { argb: colors.line } },
  };
}

function excelDate(value: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value));
}

function payableStatusLabel(status: AccountsPayableReport['rows'][number]['status']) {
  return {
    OVERDUE: 'Vencido',
    PAID: 'Pago',
    PENDING: 'Pendente',
    UNSCHEDULED: 'Sem vencimento',
  }[status];
}

function paymentChannelLabel(
  channel: AccountsPayableReport['rows'][number]['paymentChannel'],
) {
  if (!channel) return 'Nao informado';
  return {
    BANK_TRANSFER: 'Transferencia',
    BOLETO: 'Boleto',
    CARD_LINK: 'Link de cartao',
    OTHER: 'Outro',
    PIX: 'Pix',
  }[channel];
}

function workflowStageLabel(
  stage: AccountsPayableReport['rows'][number]['workflowStage'],
) {
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

function safeText(value: string): string {
  const normalized = value.replace(/[\r\n]+/g, ' ').trim();
  return /^[=+\-@]/.test(normalized) ? `'${normalized}` : normalized;
}
