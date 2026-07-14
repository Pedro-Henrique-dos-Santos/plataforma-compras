import type { DashboardSummary } from '@compras/contracts';

const palette = ['#963743', '#267a78', '#b57a18', '#59636b', '#3f6f9f', '#7b5a9d'];

export type DashboardPurchase = {
  id: string;
  supplier: string;
  issuedAt: Date;
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
  now?: Date;
  purchases: DashboardPurchase[];
}): DashboardSummary {
  const now = input.now ?? new Date();
  const currentMonth = monthKey(now);
  const previousMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const previousMonth = monthKey(previousMonthDate);
  const registeredPurchases = input.purchases.filter(
    (purchase) => monthKey(purchase.issuedAt) === currentMonth,
  );
  const previousPurchases = input.purchases.filter(
    (purchase) => monthKey(purchase.issuedAt) === previousMonth,
  );
  const currentTotal = sum(registeredPurchases.map((purchase) => purchase.total));
  const previousTotal = sum(previousPurchases.map((purchase) => purchase.total));
  const currentSavings = sum(
    registeredPurchases.map((purchase) => purchase.negotiatedSavings),
  );
  const previousSavings = sum(
    previousPurchases.map((purchase) => purchase.negotiatedSavings),
  );

  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - index), 1));
    const key = monthKey(date);
    return {
      month: new Intl.DateTimeFormat('pt-BR', {
        month: 'short',
        timeZone: 'UTC',
      })
        .format(date)
        .replace('.', '')
        .replace(/^./, (letter) => letter.toUpperCase()),
      value: roundMoney(
        sum(
          input.purchases
            .filter((purchase) => monthKey(purchase.issuedAt) === key)
            .map((purchase) => purchase.total),
        ),
      ),
    };
  });

  const spendByCategory = aggregate(
    registeredPurchases.map((purchase) => ({
      name: purchase.category?.trim() || 'Sem categoria',
      value: purchase.total,
    })),
  ).map((entry, index) => ({
    category: entry.name,
    value: entry.value,
    color: palette[index % palette.length] ?? '#963743',
  }));

  const departmentRows = registeredPurchases.flatMap((purchase) =>
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
    periodLabel: new Intl.DateTimeFormat('pt-BR', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    })
      .format(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)))
      .replace(/^./, (letter) => letter.toUpperCase()),
    totalPurchased: {
      value: roundMoney(currentTotal),
      variation: variation(currentTotal, previousTotal),
    },
    negotiatedSavings: {
      value: roundMoney(currentSavings),
      variation: variation(currentSavings, previousSavings),
    },
    activeSuppliers: input.activeSuppliers,
    registeredPurchases: registeredPurchases.length,
    monthlySpend: months,
    spendByCategory,
    spendByDepartment,
    recentPurchases: [...input.purchases]
      .sort((left, right) => right.issuedAt.getTime() - left.issuedAt.getTime())
      .slice(0, 8)
      .map((purchase) => ({
        id: purchase.id,
        supplier: purchase.supplier,
        date: purchase.issuedAt.toISOString().slice(0, 10),
        total: roundMoney(purchase.total),
        costCenter: purchaseDepartments(purchase).join(', ') || 'Nao classificado',
      })),
  };
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

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function variation(current: number, previous: number): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }
  return Math.round(((current - previous) / previous) * 1_000) / 10;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
