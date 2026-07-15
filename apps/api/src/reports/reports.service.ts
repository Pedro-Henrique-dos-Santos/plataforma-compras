import { Inject, Injectable } from '@nestjs/common';
import type { ProcurementReport, ProcurementReportFilters } from '@compras/contracts';

import { ProcurementRepository } from '../procurement/procurement.repository.js';

@Injectable()
export class ReportsService {
  constructor(
    @Inject(ProcurementRepository)
    private readonly repository: ProcurementRepository,
  ) {}

  getProcurementReport(
    organizationId: string,
    filters: ProcurementReportFilters,
  ): Promise<ProcurementReport> {
    return this.repository.getProcurementReport(organizationId, filters);
  }

  async exportProcurementCsv(
    organizationId: string,
    filters: ProcurementReportFilters,
  ): Promise<string> {
    return buildProcurementCsv(await this.getProcurementReport(organizationId, filters));
  }
}

export function buildProcurementCsv(report: ProcurementReport): string {
  const rows = report.purchases.map((purchase) => [
    purchase.number,
    purchase.invoiceNumber ?? '',
    formatDate(purchase.issuedAt),
    purchase.supplierName,
    purchase.category ?? '',
    purchase.departments.join(', '),
    sourceLabel(purchase.source),
    statusLabel(purchase.status),
    String(purchase.itemCount),
    money(purchase.total),
    money(purchase.negotiatedSavings),
  ]);
  const header = [
    'Pedido',
    'Nota fiscal',
    'Data',
    'Fornecedor',
    'Categoria',
    'Departamentos',
    'Origem',
    'Status',
    'Itens',
    'Total',
    'Economia negociada',
  ];
  return `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n')}\r\n`;
}

function csvCell(value: string): string {
  const normalized = value.replace(/[\r\n]+/g, ' ').trim();
  const protectedValue = /^[=+\-@]/.test(normalized) ? `'${normalized}` : normalized;
  return `"${protectedValue.replace(/"/g, '""')}"`;
}

function money(value: number): string {
  return value.toFixed(2).replace('.', ',');
}

function formatDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function sourceLabel(source: ProcurementReport['purchases'][number]['source']): string {
  return {
    MANUAL: 'Manual',
    CSV: 'CSV',
    INVOICE: 'Nota fiscal',
    GOOGLE_SHEETS: 'Google Sheets',
  }[source];
}

function statusLabel(status: ProcurementReport['purchases'][number]['status']): string {
  return {
    DRAFT: 'Rascunho',
    REGISTERED: 'Registrada',
    CANCELLED: 'Cancelada',
  }[status];
}
