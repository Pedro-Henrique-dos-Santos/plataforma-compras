import { useEffect, useState, type FormEvent } from 'react';
import type {
  AuditAction,
  PurchaseAuditEvent,
  PurchaseAuditPage,
} from '@compras/contracts';
import {
  ChevronLeft,
  ChevronRight,
  History,
  RotateCcw,
  Search,
  X,
} from 'lucide-react';

import { apiGet } from '../lib/api';

type PurchaseAuditDialogProps = {
  accessToken: string | null;
  onClose: () => void;
  open: boolean;
  organizationId: string;
};

type AuditFilterForm = {
  action: '' | AuditAction;
  actorUserId: string;
  dateFrom: string;
  dateTo: string;
  eventType: string;
  purchaseDisplayNumber: string;
};

const emptyFilters: AuditFilterForm = {
  action: '',
  actorUserId: '',
  dateFrom: '',
  dateTo: '',
  eventType: '',
  purchaseDisplayNumber: '',
};

export function PurchaseAuditDialog({
  accessToken,
  onClose,
  open,
  organizationId,
}: PurchaseAuditDialogProps) {
  const [draft, setDraft] = useState<AuditFilterForm>(emptyFilters);
  const [filters, setFilters] = useState<AuditFilterForm>(emptyFilters);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<PurchaseAuditPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void apiGet<PurchaseAuditPage>(purchaseAuditQuery(filters, page), {
      token: accessToken,
      organizationId,
      signal: controller.signal,
    })
      .then(setResult)
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [accessToken, filters, open, organizationId, page]);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setFilters(draft);
  }

  function clearFilters() {
    setDraft(emptyFilters);
    setFilters(emptyFilters);
    setPage(1);
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop audit-dialog-backdrop" role="presentation">
      <section
        aria-labelledby="purchase-audit-title"
        aria-modal="true"
        className="modal-panel audit-dialog"
        role="dialog"
      >
        <header className="modal-header audit-dialog-header">
          <span>
            <p className="eyebrow">Rastreabilidade</p>
            <h2 id="purchase-audit-title"><History size={20} />Historico de alteracoes</h2>
          </span>
          <button
            aria-label="Fechar"
            className="icon-button"
            onClick={onClose}
            title="Fechar"
            type="button"
          >
            <X size={18} />
          </button>
        </header>

        <form className="audit-filter-grid" onSubmit={applyFilters}>
          <label>
            Data inicial
            <input
              onChange={(event) => setDraft((current) => ({ ...current, dateFrom: event.target.value }))}
              type="date"
              value={draft.dateFrom}
            />
          </label>
          <label>
            Data final
            <input
              onChange={(event) => setDraft((current) => ({ ...current, dateTo: event.target.value }))}
              type="date"
              value={draft.dateTo}
            />
          </label>
          <label>
            Usuario
            <select
              onChange={(event) => setDraft((current) => ({ ...current, actorUserId: event.target.value }))}
              value={draft.actorUserId}
            >
              <option value="">Todos</option>
              {result?.actors.map((actor) => (
                <option key={actor.id} value={actor.id}>{actor.name}</option>
              ))}
            </select>
          </label>
          <label>
            Acao
            <select
              onChange={(event) => setDraft((current) => ({ ...current, action: event.target.value as AuditFilterForm['action'] }))}
              value={draft.action}
            >
              <option value="">Todas</option>
              <option value="CREATE">Inclusao</option>
              <option value="UPDATE">Alteracao</option>
              <option value="DELETE">Exclusao</option>
              <option value="IMPORT">Importacao</option>
            </select>
          </label>
          <label>
            Evento
            <select
              onChange={(event) => setDraft((current) => ({ ...current, eventType: event.target.value }))}
              value={draft.eventType}
            >
              <option value="">Todos</option>
              {result?.eventTypes.map((eventType) => (
                <option key={eventType.value} value={eventType.value}>{eventType.label}</option>
              ))}
            </select>
          </label>
          <label>
            Numero do pedido
            <input
              inputMode="numeric"
              min="1"
              onChange={(event) => setDraft((current) => ({ ...current, purchaseDisplayNumber: event.target.value }))}
              placeholder="Ex.: 27"
              type="number"
              value={draft.purchaseDisplayNumber}
            />
          </label>
          <span className="audit-filter-actions">
            <button className="secondary-button" type="submit"><Search size={16} />Pesquisar</button>
            <button
              aria-label="Limpar filtros"
              className="icon-button"
              onClick={clearFilters}
              title="Limpar filtros"
              type="button"
            >
              <RotateCcw size={17} />
            </button>
          </span>
        </form>

        {error && <div className="inline-error">{error}</div>}

        <div className="audit-table-wrap">
          {loading && !result ? (
            <div className="table-loading">Carregando historico</div>
          ) : (
            <table className="audit-table">
              <thead>
                <tr>
                  <th>Data e hora</th>
                  <th>Pedido</th>
                  <th>Acao</th>
                  <th>Alteracao</th>
                  <th>Responsavel</th>
                </tr>
              </thead>
              <tbody>
                {result?.items.map((event) => (
                  <tr key={event.id}>
                    <td className="audit-date-cell">{formatDateTime(event.createdAt)}</td>
                    <td>
                      <strong>{event.purchaseDisplayNumber ? `Pedido #${event.purchaseDisplayNumber}` : 'Pedido indisponivel'}</strong>
                      {event.purchaseNumber && <small>{event.purchaseNumber}</small>}
                    </td>
                    <td>
                      <span className={`audit-action audit-action-${event.action.toLowerCase()}`}>
                        {auditActionLabel(event.action)}
                      </span>
                    </td>
                    <td>
                      <strong>{event.eventLabel}</strong>
                      <small title={auditChangeSummary(event)}>{auditChangeSummary(event)}</small>
                      {event.reason && <small className="audit-reason">Motivo: {event.reason}</small>}
                    </td>
                    <td><strong>{event.actorName}</strong></td>
                  </tr>
                ))}
                {!loading && result?.items.length === 0 && (
                  <tr><td className="empty-table-cell" colSpan={5}>Nenhuma alteracao encontrada.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        <footer className="audit-pagination">
          <span>{result ? `${result.total} registros` : '0 registros'}</span>
          <span>
            <button
              aria-label="Pagina anterior"
              className="icon-button"
              disabled={loading || page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              title="Pagina anterior"
              type="button"
            >
              <ChevronLeft size={17} />
            </button>
            <strong>{result?.totalPages ? `${page} de ${result.totalPages}` : '0 de 0'}</strong>
            <button
              aria-label="Proxima pagina"
              className="icon-button"
              disabled={loading || !result || page >= result.totalPages}
              onClick={() => setPage((current) => current + 1)}
              title="Proxima pagina"
              type="button"
            >
              <ChevronRight size={17} />
            </button>
          </span>
        </footer>
      </section>
    </div>
  );
}

export function purchaseAuditQuery(filters: AuditFilterForm, page: number): string {
  const query = new URLSearchParams({ page: String(page), pageSize: '50' });
  if (filters.dateFrom) query.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) query.set('dateTo', filters.dateTo);
  if (filters.actorUserId) query.set('actorUserId', filters.actorUserId);
  if (filters.action) query.set('action', filters.action);
  if (filters.eventType) query.set('eventType', filters.eventType);
  if (filters.purchaseDisplayNumber) {
    query.set('purchaseDisplayNumber', filters.purchaseDisplayNumber);
  }
  return `/audit/purchases?${query.toString()}`;
}

export function auditChangeSummary(event: PurchaseAuditEvent): string {
  if (event.changes.length === 0) return 'Registro auditado sem campos adicionais.';
  const visible = event.changes.slice(0, 3).map((change) => {
    const field = auditFieldLabel(change.field);
    if (change.before !== null && change.after !== null) {
      return `${field}: ${auditValueLabel(change.field, change.before)} -> ${auditValueLabel(change.field, change.after)}`;
    }
    if (change.after !== null) return `${field}: ${auditValueLabel(change.field, change.after)}`;
    return `${field}: removido`;
  });
  if (event.changes.length > visible.length) {
    visible.push(`+${event.changes.length - visible.length} campos`);
  }
  return visible.join(' | ');
}

function auditActionLabel(action: AuditAction): string {
  return {
    CREATE: 'Inclusao',
    UPDATE: 'Alteracao',
    DELETE: 'Exclusao',
    IMPORT: 'Importacao',
    EXPORT: 'Exportacao',
    LOGIN: 'Acesso',
    LOGOUT: 'Saida',
    SWITCH_ORGANIZATION: 'Troca de empresa',
  }[action];
}

function auditFieldLabel(field: string): string {
  return {
    workflowStage: 'Etapa',
    status: 'Situacao',
    decision: 'Decisao',
    number: 'Referencia',
    supplierId: 'Fornecedor',
    total: 'Valor total',
    invoiceNumber: 'Nota fiscal',
    requiredApprovals: 'Aprovacoes exigidas',
    source: 'Origem',
  }[field] ?? field;
}

function auditValueLabel(field: string, value: string): string {
  if (field === 'workflowStage') return workflowStageLabels[value] ?? value;
  if (field === 'status') return statusLabels[value] ?? value;
  if (field === 'decision') return decisionLabels[value] ?? value;
  return value;
}

const workflowStageLabels: Record<string, string> = {
  REGISTRATION: 'Cadastro',
  REQUESTED: 'Solicitacao',
  AWAITING_APPROVAL: 'Aguardando aprovacao',
  PURCHASE_ORDER: 'Pedido de compra',
  SUPPLIER_INVOICED: 'Faturado pelo fornecedor',
  RECEIVED: 'Recebido',
  COMPLETED: 'Concluido',
};

const statusLabels: Record<string, string> = {
  DRAFT: 'Rascunho',
  REGISTERED: 'Registrado',
  CANCELLED: 'Cancelado',
};

const decisionLabels: Record<string, string> = {
  APPROVED: 'Aprovado',
  REJECTED: 'Reprovado',
  PENDING: 'Pendente',
};

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Nao foi possivel carregar o historico.';
}
