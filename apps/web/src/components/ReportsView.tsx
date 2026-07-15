import { useEffect, useMemo, useState } from 'react';
import type {
  CostCenter,
  ProcurementReport,
  ProcurementReportBreakdown,
  ProcurementReportFilters,
  Supplier,
} from '@compras/contracts';
import {
  CircleDollarSign,
  Download,
  Filter,
  HandCoins,
  Landmark,
  ReceiptText,
  RotateCcw,
} from 'lucide-react';

import { apiDownload, apiGet } from '../lib/api';

type ReportsViewProps = {
  accessToken: string | null;
  organizationId: string;
};

type ReportFilterForm = {
  category: string;
  costCenterId: string;
  dateFrom: string;
  dateTo: string;
  status: ProcurementReportFilters['status'];
  supplierId: string;
};

type BreakdownTab = 'supplier' | 'category' | 'department' | 'month';

const currency = new Intl.NumberFormat('pt-BR', {
  currency: 'BRL',
  style: 'currency',
});

const integer = new Intl.NumberFormat('pt-BR');

export function ReportsView({ accessToken, organizationId }: ReportsViewProps) {
  const [filters, setFilters] = useState<ReportFilterForm>(currentMonthFilters);
  const [appliedFilters, setAppliedFilters] = useState<ReportFilterForm>(currentMonthFilters);
  const [report, setReport] = useState<ProcurementReport | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [activeBreakdown, setActiveBreakdown] = useState<BreakdownTab>('department');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      apiGet<Supplier[]>('/suppliers?status=ACTIVE', {
        organizationId,
        signal: controller.signal,
        token: accessToken,
      }),
      apiGet<CostCenter[]>('/cost-centers', {
        organizationId,
        signal: controller.signal,
        token: accessToken,
      }),
    ])
      .then(([supplierResult, centerResult]) => {
        setSuppliers(supplierResult);
        setCostCenters(centerResult);
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(requestError));
      });
    return () => controller.abort();
  }, [accessToken, organizationId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void apiGet<ProcurementReport>(`/reports/procurement?${reportQuery(appliedFilters)}`, {
      organizationId,
      signal: controller.signal,
      token: accessToken,
    })
      .then(setReport)
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [accessToken, appliedFilters, organizationId]);

  const breakdown = useMemo(
    () => selectBreakdown(report, activeBreakdown),
    [activeBreakdown, report],
  );

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo) {
      setError('A data inicial nao pode ser posterior a data final.');
      return;
    }
    setError(null);
    setAppliedFilters({ ...filters, category: filters.category.trim() });
  }

  function resetFilters() {
    const next = emptyFilters();
    setFilters(next);
    setAppliedFilters(next);
    setError(null);
  }

  async function exportCsv() {
    setExporting(true);
    setError(null);
    try {
      const result = await apiDownload(
        `/reports/procurement.csv?${reportQuery(appliedFilters)}`,
        { organizationId, token: accessToken },
      );
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = result.fileName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="report-layout">
      <section className="section-heading">
        <span>
          <p className="eyebrow">Relatorio operacional</p>
          <h2>{report?.period.label ?? 'Compras consolidadas'}</h2>
        </span>
        <span className="data-status">
          <span aria-hidden="true" />
          {report?.dataSource === 'DATABASE' ? 'Dados da empresa' : 'Dados de demonstracao'}
        </span>
      </section>

      <section className="panel report-filter-panel">
        <form className="management-form report-filter-form" onSubmit={applyFilters}>
          <div className="report-filter-grid">
            <label>
              Data inicial
              <input
                onChange={(event) => setFilters({ ...filters, dateFrom: event.target.value })}
                type="date"
                value={filters.dateFrom}
              />
            </label>
            <label>
              Data final
              <input
                onChange={(event) => setFilters({ ...filters, dateTo: event.target.value })}
                type="date"
                value={filters.dateTo}
              />
            </label>
            <label>
              Fornecedor
              <select
                onChange={(event) => setFilters({ ...filters, supplierId: event.target.value })}
                value={filters.supplierId}
              >
                <option value="">Todos</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.tradeName ?? supplier.legalName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Departamento
              <select
                onChange={(event) => setFilters({ ...filters, costCenterId: event.target.value })}
                value={filters.costCenterId}
              >
                <option value="">Todos</option>
                {costCenters.map((center) => (
                  <option key={center.id} value={center.id}>
                    {center.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Categoria
              <input
                list="report-category-options"
                onChange={(event) => setFilters({ ...filters, category: event.target.value })}
                placeholder="Todas"
                value={filters.category}
              />
              <datalist id="report-category-options">
                {report?.byCategory.map((entry) => (
                  <option key={entry.key} value={entry.label} />
                ))}
              </datalist>
            </label>
            <label>
              Status
              <select
                onChange={(event) =>
                  setFilters({
                    ...filters,
                    status: event.target.value as ReportFilterForm['status'],
                  })
                }
                value={filters.status}
              >
                <option value="REGISTERED">Registrada</option>
                <option value="DRAFT">Rascunho</option>
                <option value="CANCELLED">Cancelada</option>
              </select>
            </label>
          </div>
          <div className="report-filter-actions">
            <button className="secondary-button" onClick={resetFilters} type="button">
              <RotateCcw size={16} />
              Limpar
            </button>
            <button className="primary-button" type="submit">
              <Filter size={16} />
              Aplicar filtros
            </button>
          </div>
        </form>
      </section>

      {error && <div className="inline-error">{error}</div>}

      {loading || !report ? (
        <ReportSkeleton />
      ) : (
        <>
          <section className="report-metrics-grid" aria-label="Indicadores do relatorio">
            <ReportMetric
              icon={CircleDollarSign}
              label="Valor comprado"
              tone="brand"
              value={currency.format(report.totals.purchased)}
            />
            <ReportMetric
              detail={`${report.totals.savingsPercentage.toLocaleString('pt-BR')}% do valor bruto`}
              icon={HandCoins}
              label="Economia negociada"
              tone="teal"
              value={currency.format(report.totals.negotiatedSavings)}
            />
            <ReportMetric
              icon={Landmark}
              label="Ticket medio"
              tone="gold"
              value={currency.format(report.totals.averageTicket)}
            />
            <ReportMetric
              detail={`${integer.format(report.totals.supplierCount)} fornecedores`}
              icon={ReceiptText}
              label="Compras"
              tone="graphite"
              value={integer.format(report.totals.purchaseCount)}
            />
          </section>

          <section className="panel report-breakdown-panel">
            <header className="panel-header report-panel-header">
              <span>
                <h3>Composicao dos gastos</h3>
                <p>Valores e economias no periodo selecionado</p>
              </span>
              <div aria-label="Agrupamento do relatorio" className="report-tabs" role="tablist">
                {breakdownTabs.map((tab) => (
                  <button
                    aria-selected={activeBreakdown === tab.id}
                    className={activeBreakdown === tab.id ? 'active' : ''}
                    key={tab.id}
                    onClick={() => setActiveBreakdown(tab.id)}
                    role="tab"
                    type="button"
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </header>
            <BreakdownList entries={breakdown} />
          </section>

          <section className="panel table-panel report-table-panel">
            <header className="panel-header">
              <span>
                <h3>Compras do periodo</h3>
                <p>{integer.format(report.purchases.length)} registros encontrados</p>
              </span>
              <button
                className="secondary-button compact-button"
                disabled={exporting || !report.purchases.length}
                onClick={() => void exportCsv()}
                type="button"
              >
                <Download size={16} />
                {exporting ? 'Exportando' : 'Exportar CSV'}
              </button>
            </header>
            <div className="table-scroll">
              <table className="report-table">
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Nota fiscal</th>
                    <th>Data</th>
                    <th>Fornecedor</th>
                    <th>Categoria</th>
                    <th>Departamento</th>
                    <th>Status</th>
                    <th className="align-right">Total</th>
                    <th className="align-right">Economia</th>
                  </tr>
                </thead>
                <tbody>
                  {report.purchases.length ? (
                    report.purchases.map((purchase) => (
                      <tr key={purchase.id}>
                        <td className="order-id">{purchase.number}</td>
                        <td>{purchase.invoiceNumber ?? '-'}</td>
                        <td>{formatDate(purchase.issuedAt)}</td>
                        <td>{purchase.supplierName}</td>
                        <td>{purchase.category ?? '-'}</td>
                        <td>{purchase.departments.join(', ') || 'Sem centro de custo'}</td>
                        <td>
                          <span className={`report-status ${purchase.status.toLowerCase()}`}>
                            {statusLabel(purchase.status)}
                          </span>
                        </td>
                        <td className="align-right amount-cell">{currency.format(purchase.total)}</td>
                        <td className="align-right savings-cell">
                          {currency.format(purchase.negotiatedSavings)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="empty-table-cell" colSpan={9}>
                        Nenhuma compra encontrada para os filtros selecionados
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function ReportMetric({
  detail,
  icon: Icon,
  label,
  tone,
  value,
}: {
  detail?: string;
  icon: typeof CircleDollarSign;
  label: string;
  tone: 'brand' | 'teal' | 'gold' | 'graphite';
  value: string;
}) {
  return (
    <article className="metric-card report-metric-card">
      <span className={`metric-icon ${tone}`}>
        <Icon size={20} />
      </span>
      <div className="metric-copy">
        <p>{label}</p>
        <strong>{value}</strong>
        <small className="neutral">{detail ?? 'Periodo selecionado'}</small>
      </div>
    </article>
  );
}

function BreakdownList({ entries }: { entries: ProcurementReportBreakdown[] }) {
  if (!entries.length) {
    return <div className="report-empty-breakdown">Nenhum valor para este agrupamento</div>;
  }
  const maximum = Math.max(...entries.map((entry) => entry.total), 1);
  return (
    <div className="report-breakdown-list">
      {entries.slice(0, 12).map((entry) => (
        <div className="report-breakdown-row" key={entry.key}>
          <span className="report-breakdown-label">
            <strong>{entry.label}</strong>
            <small>{integer.format(entry.purchaseCount)} compras</small>
          </span>
          <span className="report-breakdown-track" aria-hidden="true">
            <span style={{ width: `${Math.max((entry.total / maximum) * 100, 2)}%` }} />
          </span>
          <span className="report-breakdown-values">
            <strong>{currency.format(entry.total)}</strong>
            <small>{currency.format(entry.savings)} economizados</small>
          </span>
        </div>
      ))}
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div aria-label="Carregando relatorio" className="report-loading">
      <div className="report-metrics-grid">
        {[0, 1, 2, 3].map((item) => (
          <div className="skeleton metric-skeleton" key={item} />
        ))}
      </div>
      <div className="skeleton report-breakdown-skeleton" />
    </div>
  );
}

const breakdownTabs: Array<{ id: BreakdownTab; label: string }> = [
  { id: 'department', label: 'Departamento' },
  { id: 'supplier', label: 'Fornecedor' },
  { id: 'category', label: 'Categoria' },
  { id: 'month', label: 'Mes' },
];

function selectBreakdown(
  report: ProcurementReport | null,
  tab: BreakdownTab,
): ProcurementReportBreakdown[] {
  if (!report) return [];
  return {
    category: report.byCategory,
    department: report.byDepartment,
    month: report.byMonth,
    supplier: report.bySupplier,
  }[tab];
}

function reportQuery(filters: ReportFilterForm): string {
  const query = new URLSearchParams({ status: filters.status });
  if (filters.dateFrom) query.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) query.set('dateTo', filters.dateTo);
  if (filters.supplierId) query.set('supplierId', filters.supplierId);
  if (filters.costCenterId) query.set('costCenterId', filters.costCenterId);
  if (filters.category) query.set('category', filters.category);
  return query.toString();
}

function currentMonthFilters(): ReportFilterForm {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return {
    category: '',
    costCenterId: '',
    dateFrom: `${year}-${month}-01`,
    dateTo: `${year}-${month}-${day}`,
    status: 'REGISTERED',
    supplierId: '',
  };
}

function emptyFilters(): ReportFilterForm {
  return {
    category: '',
    costCenterId: '',
    dateFrom: '',
    dateTo: '',
    status: 'REGISTERED',
    supplierId: '',
  };
}

function statusLabel(status: ProcurementReport['purchases'][number]['status']): string {
  return { CANCELLED: 'Cancelada', DRAFT: 'Rascunho', REGISTERED: 'Registrada' }[status];
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00.000Z`),
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Nao foi possivel carregar o relatorio.';
}
