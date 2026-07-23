import { StreamableFile } from '@nestjs/common';
import type { OrganizationSummary, ProcurementReportFilters } from '@compras/contracts';
import { describe, expect, it, vi } from 'vitest';

import { ReportsController } from './reports.controller.js';
import type { ReportsService } from './reports.service.js';

const organization = {
  id: '019f482a-bfab-7a93-81d6-cb38e590dcb6',
  slug: 'empresa-teste',
} as OrganizationSummary;
const filters = { status: 'REGISTERED' } as ProcurementReportFilters;

describe('ReportsController', () => {
  it.each([
    ['resumido', 'exportProcurementXlsx', 'exportProcurementWorkbook'],
    ['detalhado', 'exportDetailedProcurementXlsx', 'exportDetailedProcurementWorkbook'],
  ] as const)('streams the %s workbook as a real XLSX response', async (_, serviceMethod, controllerMethod) => {
    const workbook = Buffer.from('PK synthetic workbook');
    const reports = {
      [serviceMethod]: vi.fn().mockResolvedValue(workbook),
    } as unknown as ReportsService;
    const controller = new ReportsController(reports);

    const response = await controller[controllerMethod](organization, filters);

    expect(response).toBeInstanceOf(StreamableFile);
    expect(response.getHeaders()).toMatchObject({
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      length: workbook.length,
    });
    expect(response.getHeaders().disposition).toContain(`relatorio-compras-${_}-empresa-teste-`);
    await expect(readStreamableFile(response)).resolves.toEqual(workbook);
  });
});

async function readStreamableFile(file: StreamableFile): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of file.getStream()) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
