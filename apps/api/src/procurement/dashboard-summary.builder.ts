import type { DashboardFilters, DashboardSummary } from '@compras/contracts';

const palette = ['#963743', '#267a78', '#b57a18', '#59636b', '#3f6f9f', '#7b5a9d'];

export type DashboardPurchase = {
  id: string;
  supplier: string;
  issuedAt: Date | null;
  createdAt: Date;
  total: number;
  negotiatedSavings: number;
  category: string | null;
  items: Array<{
    total: number;
    costCenter: string | null;
    allocations: Array<{ costCenter: string; amount: number }>;
  }>;
};

export function buildDashboardSummary(input: {
  activeSuppliers: number;
  dataSource: DashboardSummary['dataSource'];
  filters: DashboardFilters;
  purchases: DashboardPurchase[];
}): DashboardSummary {
  const purchased = roundMoney(sum(input.purchases.map((purchase) => purchase.total)));
  const savings = roundMoney(
    sum(input.purchases.map((purchase) => purchase.negotiatedSavings)),
  );
  const monthlySpend = aggregateMonths(input.purchases);
  const spendByCategory = aggregate(
    input.purchases.map((purchase) => ({
      name: purchase.category?.trim() || 'Sem categoria',
      value: purchase.total,
    })),
  ).map((entry, index) => ({
    category: entry.name,
    value: entry.value,
    color: palette[index % palette.length] ?? '#963743',
  }));

  const departmentRows = input.purchases.flatMap((purchase) =>
    purchase.items.flatMap((item) => {
      if (item.allocations.length) {
        return item.allocations.map((allocation) => ({
          name: allocation.costCenter,
          value: allocation.amount,
        }));
      }
      return [{ name: item.costCenter ?? 'Nao classificado', value: item.total }];
    }),
  );
  const spendByDepartment = aggregate(departmentRows).map((entry, index) => ({
    department: entry.name,
    value: entry.value,
    color: palette[(index + 1) % palette.length] ?? '#963743',
  }));

  return {
    dataSource: input.dataSource,
    periodLabel: dashboardPeriodLabel(input.filters),
    totalPurchased: { value: purchased, variation: null },
    negotiatedSavings: { value: savings, variation: null },
    activeSuppliers: input.activeSuppliers,
    registeredPurchases: input.purchases.length,
    undatedPurchases: input.purchases.filter((purchase) => purchase.issuedAt === null).length,
    monthlySpend,
    spendByCategory,
    spendByDepartment,
    recentPurchases: [...input.purchases]
      .sort(comparePurchasesDescending)
      .slice(0, 8)
      .map((purchase) => ({
        id: purchase.id,
        supplier: purchase.supplier,
        date: purchase.issuedAt?.toISOString().slice(0, 10) ?? null,
        total: roundMoney(purchase.total),
        costCenter: purchaseDepartments(purchase).join(', ') || 'Nao classificado',
      })),
  };
}

function aggregateMonths(purchases: DashboardPurchase[]) {
  const values = new Map<string, number>();
  for (const purchase of purchases) {
    if (!purchase.issuedAt) continue;
    const key = monthKey(purchase.issuedAt);
    values.set(key, (values.get(key) ?? 0) + purchase.total);
  }
  return [...values.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => ({ month: monthLabel(key), value: roundMoney(value) }));
}

function aggregate(rows: Array<{ name: string; value: number }>) {
  const values = new Map<string, number>();
  for (const row of rows) {
    values.set(row.name, (values.get(row.name) ?? 0) + row.value);
  }
  return [...values.entries()]
    .map(([name, value]) => ({ name, value: roundMoney(value) }))
    .sort((left, right) => right.value - left.value);
}

function purchaseDepartments(purchase: DashboardPurchase): string[] {
  return [
    ...new Set(
      purchase.items.flatMap((item) =>
        item.allocations.length
          ? item.allocations.map((allocation) => allocation.costCenter)
          : item.costCenter
            ? [item.costCenter]
            : [],
      ),
    ),
  ];
}

function comparePurchasesDescending(
  left: DashboardPurchase,
  right: DashboardPurchase,
): number {
  const leftDate = left.issuedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  const rightDate = right.issuedAt?.getTime() ?? Number.NEGATIVE_INFINITY;
  return rightDate - leftDate || right.createdAt.getTime() - left.createdAt.getTime();
}

function dashboardPeriodLabel(filters: DashboardFilters): string {
  if (filters.dateFrom && filters.dateTo) {
    return `${formatDate(filters.dateFrom)} a ${formatDate(filters.dateTo)}`;
  }
  if (filters.dateFrom) return `A partir de ${formatDate(filters.dateFrom)}`;
  if (filters.dateTo) return `Ate ${formatDate(filters.dateTo)}`;
  return filters.includeUndated ? 'Todo o historico' : 'Historico com data informada';
}

function formatDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(value: string): string {
  const [year, month] = value.split('-');
  const names = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return `${names[Number(month) - 1] ?? month}/${year}`;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
