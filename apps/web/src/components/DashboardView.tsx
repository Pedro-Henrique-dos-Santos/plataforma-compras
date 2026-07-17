import { useEffect, useState, type FormEvent } from 'react';
import type {
  CostCenter,
  DashboardFilters,
  DashboardSummary,
  Supplier,
} from '@compras/contracts';
import {
  ArrowDownRight,
  ArrowUpRight,
  CircleDollarSign,
  HandCoins,
  ReceiptText,
  RotateCcw,
  SlidersHorizontal,
  Store,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { apiGet } from '../lib/api';

type DashboardViewProps = {
  accessToken: string | null;
  filters: DashboardFilters;
  loading: boolean;
  onFiltersChange: (filters: DashboardFilters) => void;
  organizationId: string;
  summary: DashboardSummary | null;
};

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const compactCurrency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function DashboardView({
  accessToken,
  filters,
  loading,
  onFiltersChange,
  organizationId,
  summary,
}: DashboardViewProps) {
  const [draft, setDraft] = useState<DashboardFilters>(filters);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [filterError, setFilterError] = useState<string | null>(null);

  useEffect(() => setDraft(filters), [filters]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      apiGet<Supplier[]>('/suppliers', {
        token: accessToken,
        organizationId,
        signal: controller.signal,
      }),
      apiGet<CostCenter[]>('/cost-centers?includeInactive=true', {
        token: accessToken,
        organizationId,
        signal: controller.signal,
      }),
    ])
      .then(([nextSuppliers, nextCenters]) => {
        if (!controller.signal.aborted) {
          setSuppliers(nextSuppliers);
          setCostCenters(nextCenters);
        }
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setFilterError(
            requestError instanceof Error
              ? requestError.message
              : 'Nao foi possivel carregar os filtros.',
          );
        }
      });
    return () => controller.abort();
  }, [accessToken, organizationId]);

  function handleFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft.dateFrom && draft.dateTo && draft.dateFrom > draft.dateTo) {
      setFilterError('A data inicial nao pode ser posterior a data final.');
      return;
    }
    setFilterError(null);
    onFiltersChange({
      ...draft,
      includeUndated: draft.dateFrom || draft.dateTo ? false : draft.includeUndated,
    });
  }

  function resetFilters() {
    const reset: DashboardFilters = { includeUndated: true };
    setDraft(reset);
    setFilterError(null);
    onFiltersChange(reset);
  }

  if (loading || !summary) {
    return <DashboardSkeleton />;
  }

  const metrics = [
    {
      label: 'Comprado no periodo',
      value: currency.format(summary.totalPurchased.value),
      variation: summary.totalPurchased.variation,
      detail: 'Total do filtro selecionado',
      icon: CircleDollarSign,
      tone: 'brand',
    },
    {
      label: 'Economia negociada',
      value: currency.format(summary.negotiatedSavings.value),
      variation: summary.negotiatedSavings.variation,
      detail: 'Economia no filtro selecionado',
      icon: HandCoins,
      tone: 'teal',
    },
    {
      label: 'Fornecedores ativos',
      value: String(summary.activeSuppliers),
      variation: null,
      detail: 'Cadastros ativos na empresa',
      icon: Store,
      tone: 'gold',
    },
    {
      label: 'Compras registradas',
      value: String(summary.registeredPurchases),
      variation: null,
      detail: 'Pedidos no filtro selecionado',
      icon: ReceiptText,
      tone: 'graphite',
    },
  ] as const;

  return (
    <div className="dashboard-layout">
      <section className="section-heading">
        <span>
          <p className="eyebrow">Visao consolidada</p>
          <h2>{summary.periodLabel}</h2>
        </span>
        <span className="data-status">
          <span aria-hidden="true" />
          {summary.dataSource === 'DEMO' ? 'Dados de demonstracao' : 'Dados da empresa'}
        </span>
      </section>

      <form className="panel dashboard-filters" onSubmit={handleFilters}>
        <span className="filter-title">
          <SlidersHorizontal size={17} />
          <strong>Filtros do dashboard</strong>
        </span>
        <label>
          <span>Data inicial</span>
          <input
            onChange={(event) =>
              setDraft((current) => ({ ...current, dateFrom: event.target.value || undefined }))
            }
            type="date"
            value={draft.dateFrom ?? ''}
          />
        </label>
        <label>
          <span>Data final</span>
          <input
            onChange={(event) =>
              setDraft((current) => ({ ...current, dateTo: event.target.value || undefined }))
            }
            type="date"
            value={draft.dateTo ?? ''}
          />
        </label>
        <label>
          <span>Fornecedor</span>
          <select
            onChange={(event) =>
              setDraft((current) => ({ ...current, supplierId: event.target.value || undefined }))
            }
            value={draft.supplierId ?? ''}
          >
            <option value="">Todos</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.tradeName ?? supplier.legalName}
                {supplier.status === 'INACTIVE' ? ' (inativo)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Centro de custo</span>
          <select
            onChange={(event) =>
              setDraft((current) => ({ ...current, costCenterId: event.target.value || undefined }))
            }
            value={draft.costCenterId ?? ''}
          >
            <option value="">Todos</option>
            {costCenters.map((center) => (
              <option key={center.id} value={center.id}>
                {center.name}
                {!center.active ? ' (inativo)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Categoria</span>
          <input
            maxLength={100}
            onChange={(event) =>
              setDraft((current) => ({ ...current, category: event.target.value || undefined }))
            }
            placeholder="Todas"
            value={draft.category ?? ''}
          />
        </label>
        <label className="filter-checkbox">
          <input
            checked={draft.includeUndated}
            disabled={Boolean(draft.dateFrom || draft.dateTo)}
            onChange={(event) =>
              setDraft((current) => ({ ...current, includeUndated: event.target.checked }))
            }
            type="checkbox"
          />
          <span>Incluir pedidos sem data</span>
        </label>
        <div className="filter-actions">
          <button aria-label="Limpar filtros" className="icon-button" onClick={resetFilters} title="Limpar filtros" type="button">
            <RotateCcw size={16} />
          </button>
          <button className="primary-button" type="submit">Aplicar</button>
        </div>
        {filterError && <div className="form-error dashboard-filter-error">{filterError}</div>}
      </form>

      {summary.undatedPurchases > 0 && (
        <div className="data-warning">
          <strong>{summary.undatedPurchases} pedidos sem data</strong>
          <span>Estao incluidos nos totais e aguardam correcao da data de emissao.</span>
        </div>
      )}

      <section className="metrics-grid" aria-label="Indicadores principais">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          const positive = metric.variation !== null && metric.variation >= 0;
          return (
            <article className="metric-card" key={metric.label}>
              <span className={`metric-icon ${metric.tone}`}>
                <Icon size={20} />
              </span>
              <div className="metric-copy">
                <p>{metric.label}</p>
                <strong>{metric.value}</strong>
                {metric.variation !== null ? (
                  <small className={positive ? 'positive' : 'negative'}>
                    {positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {Math.abs(metric.variation).toLocaleString('pt-BR')}% frente ao periodo anterior
                  </small>
                ) : (
                  <small className="neutral">{metric.detail}</small>
                )}
              </div>
            </article>
          );
        })}
      </section>

      <section className="charts-grid">
        <article className="panel chart-panel spend-chart">
          <header className="panel-header">
            <span>
              <h3>Evolucao de compras</h3>
              <p>Valor registrado no periodo filtrado</p>
            </span>
          </header>
          {summary.monthlySpend.length ? (
            <div className="chart-frame" aria-label="Grafico de compras mensais">
              <ResponsiveContainer height="100%" width="100%">
                <BarChart data={summary.monthlySpend} margin={{ left: 0, right: 10, top: 12 }}>
                  <CartesianGrid stroke="var(--table-line)" strokeDasharray="3 3" vertical={false} />
                  <XAxis axisLine={false} dataKey="month" tickLine={false} />
                  <YAxis
                    axisLine={false}
                    tickFormatter={(value: number) => compactCurrency.format(value)}
                    tickLine={false}
                    width={78}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--surface-alt)' }}
                    formatter={(value) => [currency.format(Number(value)), 'Compras']}
                  />
                  <Bar dataKey="value" fill="var(--brand)" maxBarSize={44} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="empty-data-state">Nenhuma compra com data no filtro selecionado</div>
          )}
        </article>

        <article className="panel chart-panel category-chart">
          <header className="panel-header">
            <span>
              <h3>Distribuicao por categoria</h3>
              <p>Participacao no valor comprado</p>
            </span>
          </header>
          {summary.spendByCategory.length ? <div className="pie-layout">
            <div className="pie-frame" aria-label="Grafico de compras por categoria">
              <ResponsiveContainer height="100%" width="100%">
                <PieChart>
                  <Pie
                    data={summary.spendByCategory}
                    dataKey="value"
                    innerRadius={54}
                    nameKey="category"
                    outerRadius={82}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {summary.spendByCategory.map((entry) => (
                      <Cell fill={entry.color} key={entry.category} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => currency.format(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="chart-legend">
              {summary.spendByCategory.map((entry) => (
                <li key={entry.category}>
                  <span className="legend-color" style={{ backgroundColor: entry.color }} />
                  <span>
                    <strong>{entry.category}</strong>
                    <small>{currency.format(entry.value)}</small>
                  </span>
                </li>
              ))}
            </ul>
          </div> : <div className="empty-data-state">Nenhuma compra registrada por categoria</div>}
        </article>

        <article className="panel chart-panel department-chart">
          <header className="panel-header">
            <span>
              <h3>Gastos por departamento</h3>
              <p>Distribuicao por centro de custo e rateios</p>
            </span>
          </header>
          {summary.spendByDepartment.length ? <div className="pie-layout">
            <div className="pie-frame" aria-label="Grafico de gastos por departamento">
              <ResponsiveContainer height="100%" width="100%">
                <PieChart>
                  <Pie
                    data={summary.spendByDepartment}
                    dataKey="value"
                    innerRadius={54}
                    nameKey="department"
                    outerRadius={82}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {summary.spendByDepartment.map((entry) => (
                      <Cell fill={entry.color} key={entry.department} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => currency.format(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="chart-legend">
              {summary.spendByDepartment.map((entry) => (
                <li key={entry.department}>
                  <span className="legend-color" style={{ backgroundColor: entry.color }} />
                  <span>
                    <strong>{entry.department}</strong>
                    <small>{currency.format(entry.value)}</small>
                  </span>
                </li>
              ))}
            </ul>
          </div> : <div className="empty-data-state">Nenhum gasto classificado por departamento</div>}
        </article>
      </section>

      <section className="panel table-panel">
        <header className="panel-header">
          <span>
            <h3>Compras recentes</h3>
            <p>Ultimos registros da empresa ativa</p>
          </span>
        </header>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Fornecedor</th>
                <th>Centro de custo</th>
                <th>Data</th>
                <th className="align-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {summary.recentPurchases.length ? summary.recentPurchases.map((purchase) => (
                <tr key={purchase.id}>
                  <td className="order-id">{purchase.id}</td>
                  <td>{purchase.supplier}</td>
                  <td>{purchase.costCenter}</td>
                  <td>{formatDate(purchase.date)}</td>
                  <td className="align-right amount-cell">{currency.format(purchase.total)}</td>
                </tr>
              )) : (
                <tr>
                  <td className="empty-table-cell" colSpan={5}>Nenhuma compra registrada</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="dashboard-layout" aria-label="Carregando dashboard">
      <div className="skeleton heading-skeleton" />
      <div className="metrics-grid">
        {[0, 1, 2, 3].map((item) => (
          <div className="skeleton metric-skeleton" key={item} />
        ))}
      </div>
      <div className="charts-grid">
        <div className="skeleton chart-skeleton" />
        <div className="skeleton chart-skeleton" />
        <div className="skeleton chart-skeleton" />
      </div>
    </div>
  );
}

function formatDate(value: string | null) {
  if (!value) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(value));
}
