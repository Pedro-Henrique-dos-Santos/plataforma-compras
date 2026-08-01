import { useEffect, useState, type FormEvent } from 'react';
import type {
  CreateReceivableInput,
  CreateReceivableSettlementInput,
  Receivable,
  ReceivableFilters,
  ReceivablesReport,
  UpdateReceivableInput,
} from '@compras/contracts';
import {
  Banknote,
  CircleDollarSign,
  Download,
  Eye,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Search,
  X,
} from 'lucide-react';

import { apiDownload, apiGet, apiPatch, apiPost } from '../lib/api';

type Props = {
  accessToken: string | null;
  canSettle: boolean;
  canWrite: boolean;
  onChanged: () => void;
  organizationId: string;
};

type ReceivableForm = {
  amount: string;
  category: string;
  customerDocument: string;
  customerName: string;
  description: string;
  documentNumber: string;
  dueDate: string;
  expectedAt: string;
  invoiceNumber: string;
  issuedAt: string;
  notes: string;
};

const currency = new Intl.NumberFormat('pt-BR', {
  currency: 'BRL',
  style: 'currency',
});

export function ReceivablesView({
  accessToken,
  canSettle,
  canWrite,
  onChanged,
  organizationId,
}: Props) {
  const [report, setReport] = useState<ReceivablesReport | null>(null);
  const [filters, setFilters] = useState<ReceivableFilters>({});
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Receivable | null>(null);
  const [form, setForm] = useState<ReceivableForm>(emptyForm());
  const [detail, setDetail] = useState<Receivable | null>(null);
  const [settling, setSettling] = useState<Receivable | null>(null);
  const [settlementAmount, setSettlementAmount] = useState('');
  const [settlementDate, setSettlementDate] = useState(today());
  const [settlementReference, setSettlementReference] = useState('');
  const [settlementNotes, setSettlementNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void apiGet<ReceivablesReport>(`/receivables/report${queryString(filters)}`, {
      token: accessToken,
      organizationId,
      signal: controller.signal,
    })
      .then((nextReport) => {
        setReport(nextReport);
        setDetail((current) =>
          current
            ? nextReport.rows.find((row) => row.id === current.id) ?? null
            : null,
        );
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [accessToken, filters, organizationId, revision]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setError(null);
    setEditorOpen(true);
  }

  function openEdit(row: Receivable) {
    setEditing(row);
    setForm({
      amount: editableNumber(row.amount),
      category: row.category ?? '',
      customerDocument: row.customerDocument ?? '',
      customerName: row.customerName,
      description: row.description,
      documentNumber: row.documentNumber ?? '',
      dueDate: row.dueDate,
      expectedAt: row.expectedAt ?? '',
      invoiceNumber: row.invoiceNumber ?? '',
      issuedAt: row.issuedAt ?? '',
      notes: row.notes ?? '',
    });
    setError(null);
    setEditorOpen(true);
  }

  function openSettlement(row: Receivable) {
    setSettling(row);
    setSettlementAmount(editableNumber(row.balance));
    setSettlementDate(today());
    setSettlementReference('');
    setSettlementNotes('');
    setError(null);
  }

  function field<K extends keyof ReceivableForm>(key: K, value: ReceivableForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const base = toInput(form);
      if (editing) {
        await apiPatch<Receivable>(
          `/receivables/${editing.id}`,
          {
            ...base,
            expectedUpdatedAt: editing.updatedAt,
          } satisfies UpdateReceivableInput,
          { token: accessToken, organizationId },
        );
      } else {
        await apiPost<Receivable>(
          '/receivables',
          { ...base, source: 'MANUAL' } satisfies CreateReceivableInput,
          { token: accessToken, organizationId },
        );
      }
      setEditorOpen(false);
      setRevision((current) => current + 1);
      onChanged();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function saveSettlement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settling) return;
    setSubmitting(true);
    setError(null);
    try {
      const input: CreateReceivableSettlementInput = {
        expectedUpdatedAt: settling.updatedAt,
        amount: parseMoney(settlementAmount),
        receivedAt: settlementDate,
        transactionId: settlementReference.trim() || null,
        notes: settlementNotes.trim() || null,
      };
      await apiPost<Receivable>(
        `/receivables/${settling.id}/settlements`,
        input,
        { token: accessToken, organizationId },
      );
      setSettling(null);
      setRevision((current) => current + 1);
      onChanged();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleStatus(row: Receivable) {
    setPendingId(row.id);
    setError(null);
    try {
      await apiPatch<Receivable>(
        `/receivables/${row.id}/status`,
        {
          expectedUpdatedAt: row.updatedAt,
          status: row.status === 'CANCELLED' ? 'OPEN' : 'CANCELLED',
        },
        { token: accessToken, organizationId },
      );
      setRevision((current) => current + 1);
      onChanged();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setPendingId(null);
    }
  }

  async function exportWorkbook() {
    setDownloading(true);
    setError(null);
    try {
      const result = await apiDownload(
        `/receivables/export.xlsx${queryString(filters)}`,
        {
          token: accessToken,
          organizationId,
          fallbackFileName: 'contas-a-receber.xlsx',
        },
      );
      downloadBlob(result.blob, result.fileName);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setDownloading(false);
    }
  }

  const rows = report?.rows ?? [];

  return (
    <div className="management-layout receivables-workspace">
      <section className="section-heading">
        <span>
          <p className="eyebrow">Financeiro</p>
          <h2>Entradas e recebimentos</h2>
        </span>
        <span className="heading-actions">
          <button
            className="secondary-button"
            disabled={downloading}
            onClick={() => void exportWorkbook()}
            type="button"
          >
            <Download size={16} />
            {downloading ? 'Gerando' : 'Exportar Excel'}
          </button>
          {canWrite && (
            <button className="primary-button" onClick={openCreate} type="button">
              <Plus size={16} />
              Nova conta
            </button>
          )}
        </span>
      </section>

      <section className="payable-metrics receivable-metrics">
        <Metric label="Em aberto" value={report?.totals.open ?? 0} />
        <Metric danger label="Vencido" value={report?.totals.overdue ?? 0} />
        <Metric label="Proximos 30 dias" value={report?.totals.dueIn30Days ?? 0} />
        <Metric success label="Recebido" value={report?.totals.received ?? 0} />
      </section>

      <section className="filter-bar panel receivables-filter-bar">
        <label className="search-field">
          <Search size={16} />
          <span className="sr-only">Buscar conta a receber</span>
          <input
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                search: event.target.value || undefined,
              }))
            }
            placeholder="Cliente, documento, descricao ou nota fiscal"
            value={filters.search ?? ''}
          />
        </label>
        <label className="compact-select">
          <span className="sr-only">Status</span>
          <select
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                status: (event.target.value || undefined) as ReceivableFilters['status'],
              }))
            }
            value={filters.status ?? ''}
          >
            <option value="">Todos os status</option>
            <option value="OPEN">Em aberto</option>
            <option value="PARTIALLY_RECEIVED">Recebido parcialmente</option>
            <option value="RECEIVED">Recebido</option>
            <option value="OVERDUE">Vencido</option>
            <option value="CANCELLED">Cancelado</option>
          </select>
        </label>
        <label>
          <span className="sr-only">Vencimento inicial</span>
          <input
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                dateFrom: event.target.value || undefined,
              }))
            }
            title="Vencimento inicial"
            type="date"
            value={filters.dateFrom ?? ''}
          />
        </label>
        <label>
          <span className="sr-only">Vencimento final</span>
          <input
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                dateTo: event.target.value || undefined,
              }))
            }
            title="Vencimento final"
            type="date"
            value={filters.dateTo ?? ''}
          />
        </label>
        <span className="count-label">{rows.length} contas</span>
      </section>

      {error && !editorOpen && !settling && !detail && (
        <div className="inline-error">{error}</div>
      )}

      <section className="panel table-panel">
        {loading ? (
          <div className="table-loading">Carregando contas a receber</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Descricao</th>
                  <th>Vencimento</th>
                  <th>Status</th>
                  <th className="align-right">Valor</th>
                  <th className="align-right">Recebido</th>
                  <th className="align-right">Saldo</th>
                  <th className="align-right">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {rows.length ? (
                  rows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <span className="entity-cell">
                          <span className="table-avatar finance"><CircleDollarSign size={16} /></span>
                          <span>
                            <strong>{row.customerName}</strong>
                            <small>{row.customerDocument ? formatCnpj(row.customerDocument) : row.documentNumber ?? 'Sem documento'}</small>
                          </span>
                        </span>
                      </td>
                      <td><strong>{row.description}</strong><small className="table-secondary-text">{row.invoiceNumber ? `NF ${row.invoiceNumber}` : row.category ?? 'Sem categoria'}</small></td>
                      <td>{formatDate(row.dueDate)}</td>
                      <td><span className={`status-label ${statusClass(row)}`}>{statusLabel(row)}</span></td>
                      <td className="align-right amount-cell">{currency.format(row.amount)}</td>
                      <td className="align-right">{currency.format(row.receivedAmount)}</td>
                      <td className="align-right amount-cell">{currency.format(row.balance)}</td>
                      <td className="align-right table-actions-cell">
                        <button className="icon-button table-action" onClick={() => { setDetail(row); setError(null); }} title="Ver detalhes" type="button"><Eye size={16} /></button>
                        {canWrite && (
                          <button className="icon-button table-action" disabled={row.status === 'CANCELLED'} onClick={() => openEdit(row)} title="Editar" type="button"><Pencil size={16} /></button>
                        )}
                        {canSettle && row.balance > 0 && row.status !== 'CANCELLED' && (
                          <button className="icon-button table-action" onClick={() => openSettlement(row)} title="Registrar recebimento" type="button"><Banknote size={16} /></button>
                        )}
                        {canWrite && (
                          <button className="icon-button table-action" disabled={pendingId === row.id || (row.status !== 'CANCELLED' && row.receivedAmount > 0)} onClick={() => void toggleStatus(row)} title={row.status === 'CANCELLED' ? 'Reativar' : 'Cancelar'} type="button">{row.status === 'CANCELLED' ? <Power size={16} /> : <PowerOff size={16} />}</button>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td className="empty-table-cell" colSpan={8}>Nenhuma conta encontrada</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editorOpen && (
        <div className="modal-backdrop" role="presentation">
          <section aria-labelledby="receivable-title" aria-modal="true" className="modal-panel modal-wide" role="dialog">
            <header className="modal-header">
              <span><p className="eyebrow">Contas a receber</p><h2 id="receivable-title">{editing ? 'Editar conta' : 'Nova conta'}</h2></span>
              <button className="icon-button" onClick={() => setEditorOpen(false)} title="Fechar" type="button"><X size={18} /></button>
            </header>
            <form className="management-form" onSubmit={(event) => void save(event)}>
              <div className="form-grid two-columns">
                <label>Cliente<input autoFocus maxLength={160} onChange={(event) => field('customerName', event.target.value)} required value={form.customerName} /></label>
                <label>CNPJ<input maxLength={18} onChange={(event) => field('customerDocument', event.target.value)} value={form.customerDocument} /></label>
                <label className="span-two">Descricao<input maxLength={240} onChange={(event) => field('description', event.target.value)} required value={form.description} /></label>
                <label>Categoria<input maxLength={100} onChange={(event) => field('category', event.target.value)} value={form.category} /></label>
                <label>Documento interno<input maxLength={80} onChange={(event) => field('documentNumber', event.target.value)} value={form.documentNumber} /></label>
                <label>Nota fiscal<input maxLength={80} onChange={(event) => field('invoiceNumber', event.target.value)} value={form.invoiceNumber} /></label>
                <label>Valor<input inputMode="decimal" onChange={(event) => field('amount', event.target.value)} required value={form.amount} /></label>
                <label>Emissao<input onChange={(event) => field('issuedAt', event.target.value)} type="date" value={form.issuedAt} /></label>
                <label>Vencimento<input onChange={(event) => field('dueDate', event.target.value)} required type="date" value={form.dueDate} /></label>
                <label>Previsao de recebimento<input onChange={(event) => field('expectedAt', event.target.value)} type="date" value={form.expectedAt} /></label>
              </div>
              <label>Observacoes<textarea maxLength={2000} onChange={(event) => field('notes', event.target.value)} rows={3} value={form.notes} /></label>
              {error && <div className="form-error">{error}</div>}
              <footer className="modal-actions">
                <button className="secondary-button" onClick={() => setEditorOpen(false)} type="button">Cancelar</button>
                <button className="primary-button" disabled={submitting} type="submit"><Pencil size={16} />{submitting ? 'Salvando' : 'Salvar conta'}</button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {settling && (
        <div className="modal-backdrop" role="presentation">
          <section aria-labelledby="settlement-title" aria-modal="true" className="modal-panel" role="dialog">
            <header className="modal-header">
              <span><p className="eyebrow">Baixa de recebimento</p><h2 id="settlement-title">{settling.customerName}</h2></span>
              <button className="icon-button" onClick={() => setSettling(null)} title="Fechar" type="button"><X size={18} /></button>
            </header>
            <form className="management-form" onSubmit={(event) => void saveSettlement(event)}>
              <div className="receivable-balance-band"><span><small>Saldo disponivel</small><strong>{currency.format(settling.balance)}</strong></span></div>
              <label>Valor recebido<input autoFocus inputMode="decimal" onChange={(event) => setSettlementAmount(event.target.value)} required value={settlementAmount} /></label>
              <label>Data do recebimento<input onChange={(event) => setSettlementDate(event.target.value)} required type="date" value={settlementDate} /></label>
              <label>Identificador bancario<input maxLength={120} onChange={(event) => setSettlementReference(event.target.value)} value={settlementReference} /></label>
              <label>Observacoes<textarea maxLength={500} onChange={(event) => setSettlementNotes(event.target.value)} rows={3} value={settlementNotes} /></label>
              {error && <div className="form-error">{error}</div>}
              <footer className="modal-actions"><button className="secondary-button" onClick={() => setSettling(null)} type="button">Cancelar</button><button className="primary-button" disabled={submitting} type="submit"><Banknote size={16} />{submitting ? 'Registrando' : 'Registrar baixa'}</button></footer>
            </form>
          </section>
        </div>
      )}

      {detail && (
        <div className="modal-backdrop" role="presentation">
          <section aria-labelledby="receivable-detail-title" aria-modal="true" className="modal-panel modal-wide" role="dialog">
            <header className="modal-header"><span><p className="eyebrow">Conta a receber</p><h2 id="receivable-detail-title">{detail.customerName}</h2></span><button className="icon-button" onClick={() => setDetail(null)} title="Fechar" type="button"><X size={18} /></button></header>
            <div className="management-form">
              <div className="purchase-detail-summary receivable-detail-summary"><span><small>Valor</small><strong>{currency.format(detail.amount)}</strong></span><span><small>Recebido</small><strong>{currency.format(detail.receivedAmount)}</strong></span><span><small>Saldo</small><strong>{currency.format(detail.balance)}</strong></span></div>
              <section className="purchase-detail-section"><header><strong>Dados da conta</strong><span>{statusLabel(detail)}</span></header><div className="receivable-detail-grid"><span><small>Descricao</small><strong>{detail.description}</strong></span><span><small>Vencimento</small><strong>{formatDate(detail.dueDate)}</strong></span><span><small>Nota fiscal</small><strong>{detail.invoiceNumber ?? 'Nao informada'}</strong></span><span><small>Documento</small><strong>{detail.documentNumber ?? 'Nao informado'}</strong></span></div></section>
              <section className="purchase-detail-section"><header><strong>Recebimentos</strong><span>{detail.settlements.length} baixas</span></header>{detail.settlements.length ? <div className="receivable-settlement-list">{detail.settlements.map((settlement) => <div key={settlement.id}><span><strong>{currency.format(settlement.amount)}</strong><small>{formatDate(settlement.receivedAt)} | {settlement.createdByName}</small></span><span><small>{settlement.transactionId ?? 'Sem identificador bancario'}</small>{settlement.notes && <p>{settlement.notes}</p>}</span></div>)}</div> : <p className="detail-empty">Nenhum recebimento registrado.</p>}</section>
              {error && <div className="form-error">{error}</div>}
              <footer className="modal-actions"><button className="primary-button" onClick={() => setDetail(null)} type="button">Fechar</button></footer>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Metric({
  danger = false,
  label,
  success = false,
  value,
}: {
  danger?: boolean;
  label: string;
  success?: boolean;
  value: number;
}) {
  return <div className={`payable-metric ${danger ? 'danger' : ''} ${success ? 'success' : ''}`}><small>{label}</small><strong>{currency.format(value)}</strong></div>;
}

function emptyForm(): ReceivableForm {
  return {
    amount: '',
    category: '',
    customerDocument: '',
    customerName: '',
    description: '',
    documentNumber: '',
    dueDate: today(),
    expectedAt: today(),
    invoiceNumber: '',
    issuedAt: today(),
    notes: '',
  };
}

function toInput(form: ReceivableForm): Omit<CreateReceivableInput, 'source'> {
  return {
    amount: parseMoney(form.amount),
    category: form.category.trim() || null,
    customerDocument: form.customerDocument.trim() || null,
    customerName: form.customerName.trim(),
    description: form.description.trim(),
    documentNumber: form.documentNumber.trim() || null,
    dueDate: form.dueDate,
    expectedAt: form.expectedAt || null,
    invoiceNumber: form.invoiceNumber.trim() || null,
    issuedAt: form.issuedAt || null,
    notes: form.notes.trim() || null,
  };
}

function queryString(filters: ReceivableFilters) {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  const text = query.toString();
  return text ? `?${text}` : '';
}

function statusLabel(row: Receivable) {
  if (row.overdue) return 'Vencido';
  return {
    OPEN: 'Em aberto',
    PARTIALLY_RECEIVED: 'Recebido parcialmente',
    RECEIVED: 'Recebido',
    CANCELLED: 'Cancelado',
  }[row.status];
}

function statusClass(row: Receivable) {
  if (row.overdue || row.status === 'CANCELLED') return 'cancelled';
  if (row.status === 'RECEIVED') return 'active';
  return 'warning';
}

function parseMoney(value: string) {
  const compact = value.replace(/R\$|\s/g, '');
  return Number(
    compact.includes(',')
      ? compact.replace(/\./g, '').replace(',', '.')
      : compact,
  );
}

function editableNumber(value: number) {
  return value.toFixed(2).replace('.', ',');
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00.000Z`),
  );
}

function formatCnpj(value: string) {
  return value.replace(
    /^([A-Z0-9]{2})([A-Z0-9]{3})([A-Z0-9]{3})([A-Z0-9]{4})(\d{2})$/i,
    '$1.$2.$3/$4-$5',
  );
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Nao foi possivel alterar a conta.';
}
