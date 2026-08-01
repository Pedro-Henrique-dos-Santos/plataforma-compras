import { useEffect, useMemo, useState } from 'react';
import type {
  AccountsPayableFilters,
  AccountsPayableReport,
  AccountsPayableRow,
  PayableStatus,
  PaymentChannel,
  PurchaseDetail,
  SchedulePayableInput,
  Supplier,
  UpdatePayableInput,
} from '@compras/contracts';
import { CheckCircle2, Download, Pencil, Search, X } from 'lucide-react';

import { apiDownload, apiGet, apiPatch, apiPost } from '../lib/api';

type PayablesViewProps = {
  accessToken: string | null;
  canWrite: boolean;
  onChanged: () => void;
  organizationId: string;
};

type PayableEditor = {
  dueDate: string;
  paidAt: string;
  paymentChannel: '' | PaymentChannel;
  paymentNotes: string;
  paymentReference: string;
};

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function PayablesView({
  accessToken,
  canWrite,
  onChanged,
  organizationId,
}: PayablesViewProps) {
  const [report, setReport] = useState<AccountsPayableReport | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [filters, setFilters] = useState<AccountsPayableFilters>({});
  const [search, setSearch] = useState('');
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [editing, setEditing] = useState<AccountsPayableRow | null>(null);
  const [editor, setEditor] = useState<PayableEditor>(emptyEditor());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void Promise.all([
      apiGet<AccountsPayableReport>(`/payables${queryString(filters)}`, {
        token: accessToken,
        organizationId,
        signal: controller.signal,
      }),
      apiGet<Supplier[]>('/suppliers', {
        token: accessToken,
        organizationId,
        signal: controller.signal,
      }),
    ])
      .then(([nextReport, supplierRows]) => {
        setReport(nextReport);
        setSuppliers(supplierRows);
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [accessToken, filters, organizationId, revision]);

  const rows = useMemo(() => {
    const term = normalize(search);
    return (report?.rows ?? []).filter((row) => {
      const content = `${row.purchaseNumber} ${row.invoiceNumber ?? ''} ${row.supplierName} ${row.paymentReference ?? ''}`;
      return !term || normalize(content).includes(term);
    });
  }, [report, search]);

  function openEditor(row: AccountsPayableRow) {
    setEditing(row);
    setEditor({
      dueDate: row.dueDate ?? '',
      paidAt: row.paidAt ?? '',
      paymentChannel: row.paymentChannel ?? '',
      paymentNotes: row.paymentNotes ?? '',
      paymentReference: row.paymentReference ?? '',
    });
    setError(null);
  }

  async function savePayable() {
    if (!editing) return;
    setSubmitting(true);
    setError(null);
    try {
      if (editing.sequence < 1) {
        const input: SchedulePayableInput = {
          expectedUpdatedAt: editing.purchaseUpdatedAt,
          dueDate: editor.dueDate,
          paymentChannel: editor.paymentChannel || null,
          paymentReference: editor.paymentReference.trim() || null,
          paymentNotes: editor.paymentNotes.trim() || null,
        };
        await apiPost<PurchaseDetail>(
          `/payables/${editing.purchaseId}/installments`,
          input,
          { token: accessToken, organizationId },
        );
      } else {
        const input: UpdatePayableInput = {
          expectedUpdatedAt: editing.purchaseUpdatedAt,
          dueDate: editor.dueDate || undefined,
          paidAt: editor.paidAt || null,
          paymentChannel: editor.paymentChannel || null,
          paymentReference: editor.paymentReference.trim() || null,
          paymentNotes: editor.paymentNotes.trim() || null,
        };
        await apiPatch<PurchaseDetail>(
          `/payables/${editing.purchaseId}/installments/${editing.sequence}`,
          input,
          { token: accessToken, organizationId },
        );
      }
      setEditing(null);
      setRevision((current) => current + 1);
      onChanged();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function exportWorkbook() {
    setDownloading(true);
    setError(null);
    try {
      const file = await apiDownload(
        `/payables/export.xlsx${queryString(filters)}`,
        {
          token: accessToken,
          organizationId,
          fallbackFileName: 'contas-a-pagar.xlsx',
        },
      );
      const url = URL.createObjectURL(file.blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.fileName;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="management-layout">
      <section className="section-heading">
        <span>
          <p className="eyebrow">Financeiro de compras</p>
          <h2>Vencimentos e pagamentos</h2>
        </span>
        <button
          className="secondary-button"
          disabled={downloading || loading}
          onClick={() => void exportWorkbook()}
          type="button"
        >
          <Download size={16} />
          {downloading ? 'Gerando Excel' : 'Exportar Excel'}
        </button>
      </section>

      <section className="payable-metrics">
        <Metric label="Em aberto" value={report?.totals.open ?? 0} />
        <Metric label="Vencido" tone="danger" value={report?.totals.overdue ?? 0} />
        <Metric label="Proximos 30 dias" value={report?.totals.dueIn30Days ?? 0} />
        <Metric label="Sem vencimento" value={report?.totals.unscheduled ?? 0} />
      </section>

      <section className="filter-bar panel payable-filter-bar">
        <label className="search-field">
          <Search size={16} />
          <span className="sr-only">Buscar conta</span>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Pedido, nota, fornecedor ou referencia"
            value={search}
          />
        </label>
        <label className="compact-select">
          <span className="sr-only">Fornecedor</span>
          <select
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                supplierId: event.target.value || undefined,
              }))
            }
            value={filters.supplierId ?? ''}
          >
            <option value="">Todos os fornecedores</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>
                {supplier.tradeName ?? supplier.legalName}
              </option>
            ))}
          </select>
        </label>
        <label className="compact-select">
          <span className="sr-only">Status</span>
          <select
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                status: (event.target.value || undefined) as
                  | PayableStatus
                  | undefined,
              }))
            }
            value={filters.status ?? ''}
          >
            <option value="">Todos os status</option>
            <option value="PENDING">Pendente</option>
            <option value="OVERDUE">Vencido</option>
            <option value="PAID">Pago</option>
            <option value="UNSCHEDULED">Sem vencimento</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Data inicial</span>
          <input
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                dateFrom: event.target.value || undefined,
              }))
            }
            type="date"
            value={filters.dateFrom ?? ''}
          />
        </label>
        <label>
          <span className="sr-only">Data final</span>
          <input
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                dateTo: event.target.value || undefined,
              }))
            }
            type="date"
            value={filters.dateTo ?? ''}
          />
        </label>
      </section>

      {error && !editing && <div className="inline-error">{error}</div>}

      <section className="panel table-panel">
        {loading ? (
          <div className="table-loading">Carregando contas a pagar</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Fornecedor</th>
                  <th>Parcela</th>
                  <th>Vencimento</th>
                  <th>Pagamento</th>
                  <th>Status</th>
                  <th className="align-right">Valor</th>
                  {canWrite && <th className="align-right">Acoes</th>}
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.map((row) => (
                    <tr key={row.id}>
                      <td className="order-id">
                        <strong>{row.purchaseNumber}</strong>
                        <small>
                          {row.invoiceNumber ? `NF ${row.invoiceNumber}` : 'Sem nota'}
                        </small>
                      </td>
                      <td>{row.supplierName}</td>
                      <td>{row.sequence || 'Nao definida'}</td>
                      <td>{formatDate(row.dueDate)}</td>
                      <td>
                        <strong>{paymentChannelLabel(row.paymentChannel)}</strong>
                        <small className="table-secondary">
                          {row.paymentReference ?? 'Sem referencia'}
                        </small>
                      </td>
                      <td>
                        <span className={`status-label ${payableTone(row.status)}`}>
                          {payableStatusLabel(row.status)}
                        </span>
                      </td>
                      <td className="align-right amount-cell">
                        {currency.format(row.amount)}
                      </td>
                      {canWrite && (
                        <td className="align-right">
                          <button
                            className="icon-button table-action"
                            onClick={() => openEditor(row)}
                            title={
                              row.sequence < 1
                                ? 'Agendar conta'
                                : 'Editar conta'
                            }
                            type="button"
                          >
                            <Pencil size={16} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="empty-table-cell" colSpan={canWrite ? 8 : 7}>
                      Nenhuma conta encontrada
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="payable-editor-title"
            aria-modal="true"
            className="modal-panel"
            role="dialog"
          >
            <header className="modal-header">
              <span>
                <p className="eyebrow">Conta a pagar</p>
                <h2 id="payable-editor-title">
                  {editing.sequence < 1 ? 'Agendar ' : ''}
                  {editing.purchaseNumber}
                </h2>
              </span>
              <button
                className="icon-button"
                onClick={() => setEditing(null)}
                title="Fechar"
                type="button"
              >
                <X size={18} />
              </button>
            </header>
            <div className="management-form">
              <div className="form-grid two-columns">
                <label>
                  Vencimento
                  <input
                    onChange={(event) =>
                      setEditor((current) => ({
                        ...current,
                        dueDate: event.target.value,
                      }))
                    }
                    required
                    type="date"
                    value={editor.dueDate}
                  />
                </label>
                <label>
                  Canal de pagamento
                  <select
                    onChange={(event) =>
                      setEditor((current) => ({
                        ...current,
                        paymentChannel: event.target.value as PayableEditor['paymentChannel'],
                      }))
                    }
                    value={editor.paymentChannel}
                  >
                    <option value="">Nao informado</option>
                    <option value="PIX">Pix</option>
                    <option value="BOLETO">Boleto</option>
                    <option value="CARD_LINK">Link de cartao</option>
                    <option value="BANK_TRANSFER">Transferencia</option>
                    <option value="OTHER">Outro</option>
                  </select>
                </label>
                <label>
                  Referencia de pagamento
                  <input
                    maxLength={500}
                    onChange={(event) =>
                      setEditor((current) => ({
                        ...current,
                        paymentReference: event.target.value,
                      }))
                    }
                    value={editor.paymentReference}
                  />
                </label>
                {editing.sequence > 0 && (
                  <label>
                    Data do pagamento
                    <input
                      onChange={(event) =>
                        setEditor((current) => ({
                          ...current,
                          paidAt: event.target.value,
                        }))
                      }
                      type="date"
                      value={editor.paidAt}
                    />
                  </label>
                )}
              </div>
              <label>
                Observacoes financeiras
                <textarea
                  maxLength={500}
                  onChange={(event) =>
                    setEditor((current) => ({
                      ...current,
                      paymentNotes: event.target.value,
                    }))
                  }
                  rows={3}
                  value={editor.paymentNotes}
                />
              </label>
              {error && <div className="form-error">{error}</div>}
              <footer className="modal-actions">
                <button
                  className="secondary-button"
                  onClick={() => setEditing(null)}
                  type="button"
                >
                  Fechar
                </button>
                <button
                  className="primary-button"
                  disabled={submitting || !editor.dueDate}
                  onClick={() => void savePayable()}
                  type="button"
                >
                  <CheckCircle2 size={16} />
                  {submitting
                    ? 'Salvando'
                    : editing.sequence < 1
                      ? 'Agendar conta'
                      : 'Salvar conta'}
                </button>
              </footer>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Metric({
  label,
  tone,
  value,
}: {
  label: string;
  tone?: 'danger';
  value: number;
}) {
  return (
    <div className={`payable-metric ${tone ?? ''}`}>
      <small>{label}</small>
      <strong>{currency.format(value)}</strong>
    </div>
  );
}

function emptyEditor(): PayableEditor {
  return {
    dueDate: '',
    paidAt: '',
    paymentChannel: '',
    paymentNotes: '',
    paymentReference: '',
  };
}

function queryString(filters: AccountsPayableFilters): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) query.set(key, value);
  }
  const text = query.toString();
  return text ? `?${text}` : '';
}

function payableStatusLabel(status: PayableStatus): string {
  return {
    OVERDUE: 'Vencido',
    PAID: 'Pago',
    PENDING: 'Pendente',
    UNSCHEDULED: 'Sem vencimento',
  }[status];
}

function payableTone(status: PayableStatus): string {
  return {
    OVERDUE: 'cancelled',
    PAID: 'active',
    PENDING: 'warning',
    UNSCHEDULED: '',
  }[status];
}

function paymentChannelLabel(channel: PaymentChannel | null): string {
  if (!channel) return 'Nao informado';
  return {
    BANK_TRANSFER: 'Transferencia',
    BOLETO: 'Boleto',
    CARD_LINK: 'Link de cartao',
    OTHER: 'Outro',
    PIX: 'Pix',
  }[channel];
}

function formatDate(value: string | null): string {
  if (!value) return 'Sem vencimento';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00.000Z`),
  );
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Nao foi possivel carregar as contas.';
}
