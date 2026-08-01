import { Workbook } from 'exceljs';
import { describe, expect, it } from 'vitest';

import type { ReceivablesReport } from '@compras/contracts';
import { buildReceivablesWorkbook } from './receivables-workbook.js';

describe('accounts receivable Excel export', () => {
  it('creates summary and details while keeping text cells inert', async () => {
    const buffer = await buildReceivablesWorkbook(report(), '=EMPRESA!A1');
    const workbook = new Workbook();
    await workbook.xlsx.load(Uint8Array.from(buffer).buffer);

    expect(buffer.subarray(0, 2).toString()).toBe('PK');
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Resumo',
      'Contas a receber',
    ]);
    expect(workbook.getWorksheet('Resumo')?.getCell('A2').value).toContain(
      "'=EMPRESA!A1",
    );
    expect(workbook.getWorksheet('Contas a receber')?.getCell('A4').value).toBe(
      "'=CLIENTE!A1",
    );
    expect(workbook.getWorksheet('Contas a receber')?.getCell('K4').value).toBe(100);
    expect(workbook.getWorksheet('Contas a receber')?.getCell('M4').value).toBe(60);
  });
});

function report(): ReceivablesReport {
  return {
    dataSource: 'DEMO',
    generatedAt: '2026-08-01T12:00:00.000Z',
    totals: {
      open: 60,
      overdue: 0,
      dueIn30Days: 60,
      received: 40,
      rowCount: 1,
    },
    rows: [
      {
        id: '81000000-0000-4000-8000-000000000001',
        customerName: '=CLIENTE!A1',
        customerDocument: null,
        description: '@SERVICO',
        category: 'Servicos',
        documentNumber: null,
        invoiceNumber: null,
        issuedAt: '2026-08-01',
        dueDate: '2026-08-10',
        expectedAt: '2026-08-10',
        amount: 100,
        receivedAmount: 40,
        balance: 60,
        status: 'PARTIALLY_RECEIVED',
        overdue: false,
        source: 'MANUAL',
        notes: null,
        settlements: [],
        createdAt: '2026-08-01T12:00:00.000Z',
        updatedAt: '2026-08-01T12:00:00.000Z',
      },
    ],
  };
}
