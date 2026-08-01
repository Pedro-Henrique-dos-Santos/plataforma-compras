import { Workbook } from 'exceljs';
import { describe, expect, it } from 'vitest';

import type { AccountsPayableReport } from '@compras/contracts';

import { buildAccountsPayableWorkbook } from './accounts-payable-workbook.js';

describe('accounts payable Excel export', () => {
  it('creates the financial workbook and keeps imported text inert', async () => {
    const buffer = await buildAccountsPayableWorkbook(
      payableReport(),
      '=EMPRESA!A1',
    );
    const workbook = new Workbook();
    await workbook.xlsx.load(Uint8Array.from(buffer).buffer);

    expect(buffer.subarray(0, 2).toString()).toBe('PK');
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Resumo financeiro',
      'Contas a pagar',
    ]);
    expect(workbook.getWorksheet('Resumo financeiro')?.getCell('A2').value).toBe(
      "'=EMPRESA!A1 | Gerado em 14/07/2026, 09:00",
    );
    expect(workbook.getWorksheet('Contas a pagar')?.getCell('A4').value).toBe(
      "'=PEDIDO!A1",
    );
    expect(workbook.getWorksheet('Contas a pagar')?.getCell('C4').value).toBe(
      "'=FORNECEDOR!A1",
    );
    expect(workbook.getWorksheet('Contas a pagar')?.getCell('H4').value).toBe(
      "'+5511999999999",
    );
    expect(workbook.getWorksheet('Contas a pagar')?.getCell('L4').value).toBe(
      "'@OBSERVACAO",
    );
    expect(workbook.getWorksheet('Contas a pagar')?.getCell('I4').value).toBe(100);
  });
});

function payableReport(): AccountsPayableReport {
  return {
    dataSource: 'DEMO',
    generatedAt: '2026-07-14T12:00:00.000Z',
    totals: {
      open: 100,
      overdue: 0,
      dueIn7Days: 100,
      dueIn15Days: 100,
      dueIn30Days: 100,
      paid: 0,
      unscheduled: 0,
      rowCount: 1,
    },
    rows: [
      {
        id: '71000000-0000-4000-8000-000000000001:1',
        purchaseId: '71000000-0000-4000-8000-000000000001',
        purchaseNumber: '=PEDIDO!A1',
        purchaseUpdatedAt: '2026-07-14T12:00:00.000Z',
        invoiceNumber: '-NF-001',
        supplierId: '51000000-0000-4000-8000-000000000001',
        supplierName: '=FORNECEDOR!A1',
        sequence: 1,
        dueDate: '2026-07-21',
        amount: 100,
        paidAt: null,
        status: 'PENDING',
        paymentChannel: 'PIX',
        paymentReference: '+5511999999999',
        paymentNotes: '@OBSERVACAO',
        workflowStage: 'PURCHASE_ORDER',
      },
    ],
  };
}
