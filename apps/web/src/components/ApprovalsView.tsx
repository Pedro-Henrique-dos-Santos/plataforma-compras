import { useEffect, useState } from 'react';
import type { ApprovalTask, PurchaseDetail } from '@compras/contracts';
import { Check, Clock3, FileSearch, RefreshCw, X } from 'lucide-react';

import { apiGet, apiPost } from '../lib/api';

type ApprovalsViewProps = {
  accessToken: string | null;
  onChanged: () => void;
  organizationId: string;
};

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

export function ApprovalsView({
  accessToken,
  onChanged,
  organizationId,
}: ApprovalsViewProps) {
  const [tasks, setTasks] = useState<ApprovalTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<{
    detail: PurchaseDetail;
    task: ApprovalTask;
  } | null>(null);
  const [rejecting, setRejecting] = useState<ApprovalTask | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void apiGet<ApprovalTask[]>('/approvals/tasks', {
      token: accessToken,
      organizationId,
      signal: controller.signal,
    })
      .then(setTasks)
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [accessToken, organizationId, revision]);

  async function decide(
    task: ApprovalTask,
    decision: 'APPROVED' | 'REJECTED',
    reason: string | null,
  ) {
    setPendingId(task.requestId);
    setError(null);
    try {
      await apiPost<PurchaseDetail>(
        '/approvals/decisions',
        { requestId: task.requestId, decision, comment: reason },
        { token: accessToken, organizationId },
      );
      setReviewing(null);
      setRejecting(null);
      setComment('');
      setRevision((current) => current + 1);
      onChanged();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setPendingId(null);
    }
  }

  async function openReview(task: ApprovalTask) {
    setPendingId(task.requestId);
    setError(null);
    try {
      const detail = await apiGet<PurchaseDetail>(
        `/purchases/${task.purchaseId}`,
        {
          token: accessToken,
          organizationId,
        },
      );
      setReviewing({ detail, task });
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="management-layout">
      <section className="section-heading">
        <span>
          <p className="eyebrow">Fluxo de aprovacao</p>
          <h2>Decisoes pendentes</h2>
        </span>
        <button
          className="icon-button"
          disabled={loading}
          onClick={() => setRevision((current) => current + 1)}
          title="Atualizar aprovacoes"
          type="button"
        >
          <RefreshCw size={17} />
        </button>
      </section>

      {error && !rejecting && <div className="inline-error">{error}</div>}

      <section className="panel table-panel">
        {loading ? (
          <div className="table-loading">Carregando aprovacoes</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Fornecedor</th>
                  <th>Categoria</th>
                  <th>Solicitado em</th>
                  <th>Quorum</th>
                  <th className="align-right">Valor</th>
                  <th className="align-right">Decisao</th>
                </tr>
              </thead>
              <tbody>
                {tasks.length ? (
                  tasks.map((task) => (
                    <tr key={task.requestId}>
                      <td className="order-id">
                        <strong>{task.purchaseNumber}</strong>
                        <small>{task.purchaseId.slice(0, 8)}</small>
                      </td>
                      <td>{task.supplierName}</td>
                      <td>{task.category ?? 'Sem categoria'}</td>
                      <td>{formatDateTime(task.submittedAt)}</td>
                      <td>
                        <span className="approval-progress">
                          <Clock3 size={14} />
                          {task.approvedCount}/{task.requiredApprovals}
                        </span>
                      </td>
                      <td className="align-right amount-cell">
                        {currency.format(task.total)}
                      </td>
                      <td className="align-right">
                        <button
                          className="primary-button compact-button"
                          disabled={pendingId === task.requestId}
                          onClick={() => void openReview(task)}
                          type="button"
                        >
                          <FileSearch size={15} />
                          Revisar
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="empty-table-cell" colSpan={7}>
                      Nenhuma aprovacao pendente para sua conta
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {reviewing && (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="approval-review-title"
            aria-modal="true"
            className="modal-panel modal-extra-wide purchase-detail-modal"
            role="dialog"
          >
            <header className="modal-header">
              <span>
                <p className="eyebrow">Revisao para aprovacao</p>
                <h2 id="approval-review-title">{reviewing.detail.number}</h2>
              </span>
              <button
                className="icon-button"
                onClick={() => setReviewing(null)}
                title="Fechar"
                type="button"
              >
                <X size={18} />
              </button>
            </header>
            <div className="purchase-detail-content">
              <div className="purchase-detail-summary">
                <span>
                  <small>Fornecedor</small>
                  <strong>{reviewing.detail.supplierName}</strong>
                </span>
                <span>
                  <small>Valor</small>
                  <strong>{currency.format(reviewing.detail.total)}</strong>
                </span>
                <span>
                  <small>Quorum</small>
                  <strong>
                    {reviewing.task.approvedCount}/{reviewing.task.requiredApprovals}
                  </strong>
                </span>
                <span>
                  <small>Categoria</small>
                  <strong>{reviewing.detail.category ?? 'Nao informada'}</strong>
                </span>
                <span>
                  <small>Emissao</small>
                  <strong>{formatDate(reviewing.detail.issuedAt)}</strong>
                </span>
                <span>
                  <small>Economia negociada</small>
                  <strong>{currency.format(reviewing.detail.negotiatedSavings)}</strong>
                </span>
              </div>
              <section className="purchase-detail-section">
                <header>
                  <strong>Itens e centros de custo</strong>
                  <span>{reviewing.detail.items.length} itens</span>
                </header>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Descricao</th>
                        <th>Centro de custo</th>
                        <th className="align-right">Quantidade</th>
                        <th className="align-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reviewing.detail.items.map((item) => (
                        <tr key={item.id}>
                          <td>{item.description}</td>
                          <td>
                            {item.allocations.length
                              ? item.allocations
                                  .map(
                                    (allocation) =>
                                      `${allocation.costCenterName} (${allocation.percentage}%)`,
                                  )
                                  .join(', ')
                              : item.costCenterName ?? 'Nao classificado'}
                          </td>
                          <td className="align-right">{item.quantity}</td>
                          <td className="align-right amount-cell">
                            {currency.format(item.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
              <section className="purchase-detail-section">
                <header>
                  <strong>Parcelas previstas</strong>
                  <span>{reviewing.detail.installments.length} parcelas</span>
                </header>
                {reviewing.detail.installments.length ? (
                  <div className="approval-installment-list">
                    {reviewing.detail.installments.map((installment) => (
                      <span key={installment.sequence}>
                        <strong>Parcela {installment.sequence}</strong>
                        <small>
                          {formatDate(installment.dueDate)} |{' '}
                          {currency.format(installment.amount)}
                        </small>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="detail-empty">Nenhuma parcela cadastrada.</p>
                )}
              </section>
              {reviewing.detail.notes && (
                <section className="purchase-detail-section">
                  <header>
                    <strong>Observacoes</strong>
                  </header>
                  <p className="purchase-detail-notes">{reviewing.detail.notes}</p>
                </section>
              )}
              {error && <div className="form-error">{error}</div>}
            </div>
            <footer className="approval-review-actions">
              <button
                className="secondary-button"
                onClick={() => setReviewing(null)}
                type="button"
              >
                Fechar
              </button>
              <button
                className="danger-button"
                disabled={pendingId === reviewing.task.requestId}
                onClick={() => {
                  setRejecting(reviewing.task);
                  setReviewing(null);
                  setComment('');
                }}
                type="button"
              >
                <X size={16} />
                Reprovar
              </button>
              <button
                className="primary-button"
                disabled={pendingId === reviewing.task.requestId}
                onClick={() =>
                  void decide(reviewing.task, 'APPROVED', null)
                }
                type="button"
              >
                <Check size={16} />
                Aprovar
              </button>
            </footer>
          </section>
        </div>
      )}

      {rejecting && (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="reject-approval-title"
            aria-modal="true"
            className="modal-panel"
            role="dialog"
          >
            <header className="modal-header">
              <span>
                <p className="eyebrow">Decisao de compra</p>
                <h2 id="reject-approval-title">Reprovar {rejecting.purchaseNumber}</h2>
              </span>
              <button
                className="icon-button"
                onClick={() => setRejecting(null)}
                title="Fechar"
                type="button"
              >
                <X size={18} />
              </button>
            </header>
            <div className="management-form">
              <label>
                Motivo da reprovacao
                <textarea
                  autoFocus
                  maxLength={500}
                  minLength={3}
                  onChange={(event) => setComment(event.target.value)}
                  required
                  rows={4}
                  value={comment}
                />
              </label>
              {error && <div className="form-error">{error}</div>}
              <footer className="modal-actions">
                <button
                  className="secondary-button"
                  onClick={() => setRejecting(null)}
                  type="button"
                >
                  Fechar
                </button>
                <button
                  className="danger-button"
                  disabled={
                    pendingId === rejecting.requestId || comment.trim().length < 3
                  }
                  onClick={() =>
                    void decide(rejecting, 'REJECTED', comment.trim())
                  }
                  type="button"
                >
                  <X size={16} />
                  Confirmar reprovacao
                </button>
              </footer>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatDate(value: string | null): string {
  if (!value) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00.000Z`),
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Nao foi possivel registrar a decisao.';
}
