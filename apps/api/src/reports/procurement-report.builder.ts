import type {
  ProcurementReport,
  ProcurementReportBreakdown,
  ProcurementReportFilters,
  PurchaseSource,
  PurchaseStatus,
} from '@compras/contracts';

export type ReportPurchaseInput = {
  id: string;
  number: string;
  invoiceNumber: string | null;
  issuedAt: string | null;
  supplierId: string;
  supplierName: string;
  category: string | null;
  source: PurchaseSource;
  status: PurchaseStatus;
  itemCount: number;
  total: number;
  negotiatedSavings: number;
  departmentAllocations: Array<{
    departmentId: string;
    departmentName: string;
    amount: number;
  }>;
};

type BreakdownInput = {
  key: string;
  label: string;
  purchaseId: string;
  total: number;
  savings: number;
};

export function buildProcurementReport(input: {
  dataSource: ProcurementReport['dataSource'];
  filters: ProcurementReportFilters;
  purchases: ReportPurchaseInput[];
  now?: Date;
}): ProcurementReport {
  const purchases = [...input.purchases].sort((left, right) =>
    (right.issuedAt ?? '').localeCompare(left.issuedAt ?? '') ||
    right.number.localeCompare(left.number),
  );
  const purchased = roundMoney(purchases.reduce((sum, purchase) => sum + purchase.total, 0));
  const negotiatedSavings = roundMoney(
    purchases.reduce((sum, purchase) => sum + purchase.negotiatedSavings, 0),
  );
  const grossValue = purchased + negotiatedSavings;

  return {
    dataSource: input.dataSource,
    generatedAt: (input.now ?? new Date()).toISOString(),
    period: {
      dateFrom: input.filters.dateFrom ?? null,
      dateTo: input.filters.dateTo ?? null,
      label: periodLabel(input.filters.dateFrom, input.filters.dateTo),
    },
    totals: {
      purchased,
      negotiatedSavings,
      savingsPercentage: grossValue > 0 ? roundPercentage((negotiatedSavings / grossValue) * 100) : 0,
      averageTicket: purchases.length ? roundMoney(purchased / purchases.length) : 0,
      purchaseCount: purchases.length,
      supplierCount: new Set(purchases.map((purchase) => purchase.supplierId)).size,
    },
    bySupplier: aggregateBreakdown(
      purchases.map((purchase) => ({
        key: purchase.supplierId,
        label: purchase.supplierName,
        purchaseId: purchase.id,
        total: purchase.total,
        savings: purchase.negotiatedSavings,
      })),
    ),
    byCategory: aggregateBreakdown(
      purchases.map((purchase) => ({
        key: normalizeKey(purchase.category ?? 'sem categoria'),
        label: purchase.category ?? 'Sem categoria',
        purchaseId: purchase.id,
        total: purchase.total,
        savings: purchase.negotiatedSavings,
      })),
    ),
    byDepartment: aggregateBreakdown(
      purchases.flatMap((purchase) =>
        effectiveDepartments(purchase).map((department) => ({
          key: department.departmentId,
          label: department.departmentName,
          purchaseId: purchase.id,
          total: department.amount,
          savings:
            purchase.total > 0
              ? roundMoney(purchase.negotiatedSavings * (department.amount / purchase.total))
              : 0,
        })),
      ),
    ),
    byMonth: aggregateBreakdown(
      purchases.map((purchase) => ({
        key: purchase.issuedAt?.slice(0, 7) ?? 'sem-data',
        label: purchase.issuedAt ? monthLabel(purchase.issuedAt.slice(0, 7)) : 'Sem data',
        purchaseId: purchase.id,
        total: purchase.total,
        savings: purchase.negotiatedSavings,
      })),
      'key',
    ),
    purchases: purchases.map((purchase) => ({
      id: purchase.id,
      number: purchase.number,
      invoiceNumber: purchase.invoiceNumber,
      issuedAt: purchase.issuedAt,
      supplierId: purchase.supplierId,
      supplierName: purchase.supplierName,
      category: purchase.category,
      departments: [
        ...new Set(effectiveDepartments(purchase).map((department) => department.departmentName)),
      ].sort((left, right) => left.localeCompare(right, 'pt-BR')),
      source: purchase.source,
      status: purchase.status,
      itemCount: purchase.itemCount,
      total: roundMoney(purchase.total),
      negotiatedSavings: roundMoney(purchase.negotiatedSavings),
    })),
  };
}

function effectiveDepartments(purchase: ReportPurchaseInput) {
  if (purchase.departmentAllocations.length) return purchase.departmentAllocations;
  return [
    {
      departmentId: 'unallocated',
      departmentName: 'Sem centro de custo',
      amount: purchase.total,
    },
  ];
}

function aggregateBreakdown(
  entries: BreakdownInput[],
  sortBy: 'total' | 'key' = 'total',
): ProcurementReportBreakdown[] {
  const groups = new Map<
    string,
    { key: string; label: string; total: number; savings: number; purchases: Set<string> }
  >();
  for (const entry of entries) {
    const current = groups.get(entry.key) ?? {
      key: entry.key,
      label: entry.label,
      total: 0,
      savings: 0,
      purchases: new Set<string>(),
    };
    current.total += entry.total;
    current.savings += entry.savings;
    current.purchases.add(entry.purchaseId);
    groups.set(entry.key, current);
  }
  return [...groups.values()]
    .map((group) => ({
      key: group.key,
      label: group.label,
      total: roundMoney(group.total),
      savings: roundMoney(group.savings),
      purchaseCount: group.purchases.size,
    }))
    .sort((left, right) =>
      sortBy === 'key'
        ? left.key.localeCompare(right.key)
        : right.total - left.total || left.label.localeCompare(right.label, 'pt-BR'),
    );
}

function periodLabel(dateFrom?: string, dateTo?: string): string {
  if (dateFrom && dateTo) return `${formatDate(dateFrom)} a ${formatDate(dateTo)}`;
  if (dateFrom) return `A partir de ${formatDate(dateFrom)}`;
  if (dateTo) return `Ate ${formatDate(dateTo)}`;
  return 'Todo o historico';
}

function formatDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function monthLabel(value: string): string {
  const [year, month] = value.split('-');
  const names = [
    'Jan',
    'Fev',
    'Mar',
    'Abr',
    'Mai',
    'Jun',
    'Jul',
    'Ago',
    'Set',
    'Out',
    'Nov',
    'Dez',
  ];
  return `${names[Number(month) - 1] ?? month}/${year}`;
}

function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundPercentage(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
