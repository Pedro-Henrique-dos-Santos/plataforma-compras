import { useEffect, useMemo, useState } from 'react';
import type {
  PayableKanbanCard,
  PayableKanbanFilters,
  PaymentApprovalTask,
  PaymentChannel,
  PaymentInstructionInput,
  PaymentSettings,
  PaymentWorkflowStage,
  PixKeyType,
  Supplier,
} from '@compras/contracts';
import {
  BadgeCheck,
  Banknote,
  Check,
  Clock3,
  Columns3,
  Download,
  ExternalLink,
  FileCheck2,
  FileUp,
  List,
  PencilLine,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';

import { apiDownload, apiForm, apiGet, apiPost, apiPut } from '../lib/api';

type Props = {
  accessToken: string | null;
  canActOnApprovals: boolean;
  canSettle: boolean;
  canWrite: boolean;
  onChanged: () => void;
  organizationId: string;
};

type EditorMode = 'ADVANCE' | 'DETAIL' | 'INSTRUCTION' | 'SETTLEMENT';

type InstructionForm = {
  beneficiaryDocument: string;
  beneficiaryName: string;
  notes: string;
  paymentChannel: PaymentChannel;
  paymentReference: string;
  pixCopyPaste: string;
  pixKey: string;
  pixKeyType: '' | PixKeyType;
};

const stages: PaymentWorkflowStage[] = [
  'MATCHING_REQUIRED',
  'AWAITING_APPROVAL',
  'READY_TO_PAY',
  'PARTIALLY_PAID',
  'PAID',
];

const currency = new Intl.NumberFormat('pt-BR', {
  currency: 'BRL',
  style: 'currency',
});

export function FinancialWorkflowView({
  accessToken,
  canActOnApprovals,
  canSettle,
  canWrite,
  onChanged,
  organizationId,
}: Props) {
  const [cards, setCards] = useState<PayableKanbanCard[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [tasks, setTasks] = useState<PaymentApprovalTask[]>([]);
  const [filters, setFilters] = useState<PayableKanbanFilters>({});
  const [viewMode, setViewMode] = useState<'KANBAN' | 'TABLE'>('KANBAN');
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [selected, setSelected] = useState<PayableKanbanCard | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>('DETAIL');
  const [instruction, setInstruction] = useState<InstructionForm>(emptyInstruction());
  const [qrImage, setQrImage] = useState<File | null>(null);
  const [settlementAmount, setSettlementAmount] = useState('');
  const [settlementDate, setSettlementDate] = useState(today());
  const [settlementReference, setSettlementReference] = useState('');
  const [settlementProof, setSettlementProof] = useState<File | null>(null);
  const [advanceReason, setAdvanceReason] = useState('');
  const [advanceEvidence, setAdvanceEvidence] = useState<File | null>(null);
  const [approvalQueueOpen, setApprovalQueueOpen] = useState(false);
  const [decisionComments, setDecisionComments] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void Promise.all([
      apiGet<PayableKanbanCard[]>(
        `/procure-to-pay/payables${queryString(filters)}`,
        { token: accessToken, organizationId, signal: controller.signal },
      ),
      apiGet<Supplier[]>('/suppliers', {
        token: accessToken,
        organizationId,
        signal: controller.signal,
      }),
      apiGet<PaymentSettings>('/procure-to-pay/payment-settings', {
        token: accessToken,
        organizationId,
        signal: controller.signal,
      }),
      canActOnApprovals
        ? apiGet<PaymentApprovalTask[]>('/procure-to-pay/payment-approvals/tasks', {
            token: accessToken,
            organizationId,
            signal: controller.signal,
          })
        : Promise.resolve([]),
    ])
      .then(([nextCards, nextSuppliers, nextSettings, nextTasks]) => {
        setCards(nextCards);
        setSuppliers(nextSuppliers);
        setSettings(nextSettings);
        setTasks(nextTasks);
        setSelected((current) =>
          current ? nextCards.find((card) => card.id === current.id) ?? null : null,
        );
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [accessToken, canActOnApprovals, filters, organizationId, revision]);

  const totals = useMemo(
    () => ({
      open: cards.reduce((sum, card) => sum + card.balance, 0),
      overdue: cards.filter((card) => card.overdue).reduce((sum, card) => sum + card.balance, 0),
      paid: cards.reduce((sum, card) => sum + card.paidAmount, 0),
      ready: cards.filter((card) => card.stage === 'READY_TO_PAY').reduce((sum, card) => sum + card.balance, 0),
    }),
    [cards],
  );

  function openCard(card: PayableKanbanCard, mode: EditorMode = 'DETAIL') {
    setSelected(card);
    setEditorMode(mode);
    setInstruction(instructionFromCard(card, suppliers));
    setQrImage(null);
    setSettlementAmount(String(card.balance.toFixed(2)));
    setSettlementDate(today());
    setSettlementReference('');
    setSettlementProof(null);
    setAdvanceReason(card.advanceReason ?? '');
    setAdvanceEvidence(null);
    setError(null);
  }

  async function saveInstruction() {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload: PaymentInstructionInput = {
        expectedUpdatedAt: selected.updatedAt,
        paymentChannel: instruction.paymentChannel,
        paymentReference: instruction.paymentReference.trim() || null,
        pixKeyType:
          instruction.paymentChannel === 'PIX' && instruction.pixKey
            ? instruction.pixKeyType || null
            : null,
        pixKey: instruction.paymentChannel === 'PIX' ? instruction.pixKey.trim() || null : null,
        beneficiaryName:
          instruction.paymentChannel === 'PIX'
            ? instruction.beneficiaryName.trim() || null
            : null,
        beneficiaryDocument:
          instruction.paymentChannel === 'PIX'
            ? instruction.beneficiaryDocument.trim() || null
            : null,
        pixCopyPaste:
          instruction.paymentChannel === 'PIX'
            ? instruction.pixCopyPaste.trim() || null
            : null,
        notes: instruction.notes.trim() || null,
      };
      let updated = await apiPut<PayableKanbanCard>(
        `/procure-to-pay/payables/${selected.id}/instruction`,
        payload,
        { token: accessToken, organizationId },
      );
      if (qrImage) {
        const form = new FormData();
        form.append('expectedUpdatedAt', updated.updatedAt);
        form.append('image', qrImage);
        updated = await apiForm<PayableKanbanCard>(
          `/procure-to-pay/payables/${selected.id}/pix-qr`,
          form,
          'POST',
          { token: accessToken, organizationId },
        );
      }
      replaceCard(updated);
      setSelected(updated);
      setEditorMode('DETAIL');
      onChanged();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function requestApproval(card: PayableKanbanCard) {
    setSubmitting(true);
    setError(null);
    try {
      const updated = await apiPost<PayableKanbanCard[]>(
        '/procure-to-pay/payment-approvals',
        { expectedUpdatedAt: card.purchaseUpdatedAt, installmentIds: [card.id] },
        { token: accessToken, organizationId },
      );
      setCards((current) => mergeCards(current, updated));
      setSelected(updated.find((item) => item.id === card.id) ?? null);
      setRevision((current) => current + 1);
      onChanged();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function requestAdvance() {
    if (!selected || !advanceEvidence) return;
    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('expectedUpdatedAt', selected.updatedAt);
      form.append('reason', advanceReason.trim());
      form.append('evidence', advanceEvidence);
      const updated = await apiForm<PayableKanbanCard>(
        `/procure-to-pay/payables/${selected.id}/advance`,
        form,
        'POST',
        { token: accessToken, organizationId },
      );
      replaceCard(updated);
      setSelected(updated);
      setEditorMode('DETAIL');
      onChanged();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function openAdvanceEvidence(card: PayableKanbanCard) {
    setError(null);
    try {
      const access = await apiGet<{ expiresAt: string; url: string }>(
        `/procure-to-pay/payables/${card.id}/advance-evidence-url`,
        { token: accessToken, organizationId },
      );
      window.open(access.url, '_blank', 'noopener,noreferrer');
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  async function registerSettlement() {
    if (!selected || !settlementProof) return;
    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('expectedUpdatedAt', selected.updatedAt);
      form.append('paidAt', settlementDate);
      form.append('amount', settlementAmount.replace(',', '.'));
      form.append('transactionId', settlementReference.trim());
      form.append('proof', settlementProof);
      const updated = await apiForm<PayableKanbanCard>(
        `/procure-to-pay/payables/${selected.id}/settlements`,
        form,
        'POST',
        { token: accessToken, organizationId },
      );
      replaceCard(updated);
      setSelected(updated);
      setEditorMode('DETAIL');
      onChanged();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function decide(task: PaymentApprovalTask, decision: 'APPROVED' | 'REJECTED') {
    setSubmitting(true);
    setError(null);
    try {
      await apiPost<void>(
        '/procure-to-pay/payment-approvals/decisions',
        {
          requestId: task.requestId,
          decision,
          comment: decisionComments[task.requestId]?.trim() || null,
        },
        { token: accessToken, organizationId },
      );
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
      const result = await apiDownload('/payables/export.xlsx', {
        token: accessToken,
        organizationId,
        fallbackFileName: 'contas-a-pagar.xlsx',
      });
      downloadBlob(result.blob, result.fileName);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setDownloading(false);
    }
  }

  function replaceCard(card: PayableKanbanCard) {
    setCards((current) => current.map((item) => (item.id === card.id ? card : item)));
  }

  return (
    <div className="management-layout financial-workflow">
      <section className="section-heading">
        <span>
          <p className="eyebrow">Financeiro de compras</p>
          <h2>Fluxo de pagamento</h2>
        </span>
        <span className="heading-actions">
          {canActOnApprovals && (
            <button className="secondary-button" onClick={() => setApprovalQueueOpen(true)} type="button">
              <ShieldCheck size={16} />
              Aprovacoes {tasks.length > 0 ? `(${tasks.length})` : ''}
            </button>
          )}
          <span className="segmented-control" aria-label="Visualizacao financeira">
            <button aria-pressed={viewMode === 'KANBAN'} onClick={() => setViewMode('KANBAN')} title="Kanban" type="button"><Columns3 size={16} /><span>Kanban</span></button>
            <button aria-pressed={viewMode === 'TABLE'} onClick={() => setViewMode('TABLE')} title="Tabela" type="button"><List size={16} /><span>Tabela</span></button>
          </span>
          <button className="secondary-button" disabled={downloading} onClick={() => void exportWorkbook()} type="button">
            <Download size={16} />{downloading ? 'Gerando Excel' : 'Exportar Excel'}
          </button>
        </span>
      </section>

      <section className="payable-metrics">
        <Metric label="Saldo em aberto" value={totals.open} />
        <Metric label="Liberado" value={totals.ready} />
        <Metric label="Vencido" tone="danger" value={totals.overdue} />
        <Metric label="Baixado" value={totals.paid} />
      </section>

      <section className="filter-bar panel financial-filter-bar">
        <label className="search-field">
          <Search size={16} /><span className="sr-only">Buscar titulo</span>
          <input onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value || undefined }))} placeholder="Pedido, fornecedor ou nota fiscal" value={filters.search ?? ''} />
        </label>
        <label className="compact-select">
          <span className="sr-only">Fornecedor</span>
          <select onChange={(event) => setFilters((current) => ({ ...current, supplierId: event.target.value || undefined }))} value={filters.supplierId ?? ''}>
            <option value="">Todos os fornecedores</option>
            {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.tradeName ?? supplier.legalName}</option>)}
          </select>
        </label>
        <label><span className="sr-only">Data inicial</span><input onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value || undefined }))} type="date" value={filters.dateFrom ?? ''} /></label>
        <label><span className="sr-only">Data final</span><input onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value || undefined }))} type="date" value={filters.dateTo ?? ''} /></label>
      </section>

      {settings?.approvalMode === 'DISABLED' && (
        <div className="workflow-notice"><BadgeCheck size={17} /><span>A aprovacao financeira comum esta desabilitada. Titulos conciliados sao liberados com auditoria; adiantamentos continuam exigindo duas aprovacoes.</span></div>
      )}
      {error && !selected && !approvalQueueOpen && <div className="inline-error">{error}</div>}

      {loading ? (
        <div className="panel table-loading">Carregando fluxo financeiro</div>
      ) : viewMode === 'KANBAN' ? (
        <section className="financial-kanban" aria-label="Fluxo dos titulos financeiros">
          {stages.map((stage) => {
            const laneCards = cards.filter((card) => card.stage === stage);
            return (
              <section className="kanban-lane financial-lane" key={stage}>
                <header className="kanban-lane-header"><strong>{stageLabel(stage)}</strong><span>{laneCards.length}</span></header>
                <div className="kanban-card-list">
                  {laneCards.map((card) => (
                    <button className={`financial-card ${card.overdue ? 'overdue' : ''}`} key={card.id} onClick={() => openCard(card)} type="button">
                      <span className="financial-card-heading"><strong>{card.purchaseNumber}</strong><small>Parcela {card.sequence}</small></span>
                      <span className="financial-card-supplier">{card.supplierName}</span>
                      <strong className="kanban-card-total">{currency.format(card.balance)}</strong>
                      <span className="financial-card-meta"><Clock3 size={14} />{formatDate(card.dueDate)}{card.overdue ? ' | Vencido' : ''}</span>
                      <span className="financial-card-meta"><FileCheck2 size={14} />{card.invoiceNumbers.length ? `NF ${card.invoiceNumbers.join(', ')}` : card.fiscalDocumentRequired ? 'Sem nota conciliada' : 'Documento nao exigido'}</span>
                      <span className="financial-card-meta"><BadgeCheck size={14} />{card.received ? 'Recebimento confirmado' : 'Aguardando recebimento'}</span>
                      {card.advancePayment && <span className="financial-card-approval">Adiantamento extraordinario</span>}
                      {card.approval && <span className="financial-card-approval">{card.approval.approvedCount}/{card.approval.requiredApprovals} aprovacoes</span>}
                    </button>
                  ))}
                  {!laneCards.length && <p className="kanban-empty">Nenhum titulo</p>}
                </div>
              </section>
            );
          })}
        </section>
      ) : (
        <FinancialTable cards={cards} onOpen={openCard} />
      )}

      {selected && (
        <div className="modal-backdrop" role="presentation">
          <section aria-labelledby="financial-title" aria-modal="true" className="modal-panel modal-wide" role="dialog">
            <header className="modal-header">
              <span><p className="eyebrow">Titulo financeiro</p><h2 id="financial-title">{selected.purchaseNumber} | Parcela {selected.sequence}</h2></span>
              <button className="icon-button" onClick={() => setSelected(null)} title="Fechar" type="button"><X size={18} /></button>
            </header>
            <div className="modal-tabs" role="tablist">
              <button aria-selected={editorMode === 'DETAIL'} onClick={() => setEditorMode('DETAIL')} role="tab" type="button">Resumo</button>
              {canWrite && <button aria-selected={editorMode === 'INSTRUCTION'} onClick={() => setEditorMode('INSTRUCTION')} role="tab" type="button">Instrucao</button>}
              {canWrite && selected.balance > 0.001 && <button aria-selected={editorMode === 'ADVANCE'} onClick={() => setEditorMode('ADVANCE')} role="tab" type="button">Adiantamento</button>}
              {canSettle && ['READY_TO_PAY', 'PARTIALLY_PAID'].includes(selected.stage) && <button aria-selected={editorMode === 'SETTLEMENT'} onClick={() => setEditorMode('SETTLEMENT')} role="tab" type="button">Registrar baixa</button>}
            </div>
            {editorMode === 'DETAIL' && <TitleDetail card={selected} onOpenAdvanceEvidence={() => void openAdvanceEvidence(selected)} />}
            {editorMode === 'INSTRUCTION' && (
              <InstructionEditor form={instruction} onChange={setInstruction} onQrChange={setQrImage} qrFile={qrImage} />
            )}
            {editorMode === 'SETTLEMENT' && (
              <div className="management-form financial-action-form">
                <div className="form-grid two-columns">
                  <label>Valor da baixa<input min="0.01" onChange={(event) => setSettlementAmount(event.target.value)} step="0.01" type="number" value={settlementAmount} /></label>
                  <label>Data do pagamento<input onChange={(event) => setSettlementDate(event.target.value)} type="date" value={settlementDate} /></label>
                  <label className="full-span">Identificador bancario<input maxLength={160} onChange={(event) => setSettlementReference(event.target.value)} placeholder="ID da transacao, autenticacao ou nosso numero" value={settlementReference} /></label>
                  <label className="file-field full-span"><span>Comprovante privado</span><input accept="application/pdf,image/png,image/jpeg" onChange={(event) => setSettlementProof(event.target.files?.[0] ?? null)} type="file" /><small>{settlementProof?.name ?? 'PDF, PNG ou JPEG, ate 10 MB'}</small></label>
                </div>
              </div>
            )}
            {editorMode === 'ADVANCE' && (
              <div className="management-form financial-action-form">
                <div className="form-grid two-columns">
                  <label className="full-span">Justificativa extraordinaria<textarea maxLength={500} minLength={15} onChange={(event) => setAdvanceReason(event.target.value)} rows={4} value={advanceReason} /></label>
                  <label className="file-field full-span"><span>Documento de suporte privado</span><input accept="application/pdf,image/png,image/jpeg" onChange={(event) => setAdvanceEvidence(event.target.files?.[0] ?? null)} type="file" /><small>{advanceEvidence?.name ?? 'Contrato, proposta ou documento em PDF, PNG ou JPEG, ate 10 MB'}</small></label>
                </div>
                <div className="workflow-notice"><FileUp size={16} /><span>O adiantamento nao dispensa a conciliacao posterior com a NF-e e o recebimento. A liberacao exige duas pessoas.</span></div>
              </div>
            )}
            {error && <div className="form-error">{error}</div>}
            <footer className="modal-actions">
              <button className="secondary-button" onClick={() => setSelected(null)} type="button">Fechar</button>
              {editorMode === 'DETAIL' && canWrite && selected.stage === 'MATCHING_REQUIRED' && selected.instruction && (selected.advancePayment ? selected.hasAdvanceEvidence : selected.received && (!selected.fiscalDocumentRequired || selected.invoiceNumbers.length > 0)) && (settings?.approvalMode !== 'DISABLED' || selected.advancePayment) && (
                <button className="primary-button" disabled={submitting} onClick={() => void requestApproval(selected)} type="button"><ShieldCheck size={16} />{selected.advancePayment ? 'Enviar para aprovacao extraordinaria' : 'Enviar para aprovacao'}</button>
              )}
              {editorMode === 'INSTRUCTION' && <button className="primary-button" disabled={submitting} onClick={() => void saveInstruction()} type="button"><PencilLine size={16} />{submitting ? 'Salvando' : 'Salvar instrucao'}</button>}
              {editorMode === 'ADVANCE' && <button className="primary-button" disabled={submitting || !advanceEvidence || advanceReason.trim().length < 15} onClick={() => void requestAdvance()} type="button"><FileUp size={16} />{submitting ? 'Registrando' : 'Registrar adiantamento'}</button>}
              {editorMode === 'SETTLEMENT' && <button className="primary-button" disabled={submitting || !settlementProof || !settlementReference.trim() || Number(settlementAmount.replace(',', '.')) <= 0} onClick={() => void registerSettlement()} type="button"><Banknote size={16} />{submitting ? 'Registrando' : 'Confirmar baixa'}</button>}
            </footer>
          </section>
        </div>
      )}

      {approvalQueueOpen && (
        <div className="modal-backdrop" role="presentation">
          <section aria-labelledby="payment-approval-title" aria-modal="true" className="modal-panel modal-wide" role="dialog">
            <header className="modal-header"><span><p className="eyebrow">Aprovacao financeira</p><h2 id="payment-approval-title">Pendencias para sua decisao</h2></span><button className="icon-button" onClick={() => setApprovalQueueOpen(false)} title="Fechar" type="button"><X size={18} /></button></header>
            <div className="approval-task-list financial-approval-list">
              {tasks.map((task) => (
                <section className="financial-approval-row" key={task.requestId}>
                  <header><span><strong>{task.purchaseNumber}</strong><small>{task.supplierName} | {task.ruleName}</small></span><strong>{currency.format(task.amount)}</strong></header>
                  <p>{task.titles.length} titulo(s) | {task.approvedCount}/{task.requiredApprovals} aprovacoes</p>
                  <label>Comentario<textarea maxLength={500} onChange={(event) => setDecisionComments((current) => ({ ...current, [task.requestId]: event.target.value }))} rows={2} value={decisionComments[task.requestId] ?? ''} /></label>
                  <footer><button className="secondary-button danger-action" disabled={submitting || !(decisionComments[task.requestId]?.trim())} onClick={() => void decide(task, 'REJECTED')} type="button"><X size={16} />Reprovar</button><button className="primary-button" disabled={submitting} onClick={() => void decide(task, 'APPROVED')} type="button"><Check size={16} />Aprovar</button></footer>
                </section>
              ))}
              {!tasks.length && <p className="detail-empty">Nenhuma aprovacao financeira pendente.</p>}
            </div>
            {error && <div className="form-error">{error}</div>}
            <footer className="modal-actions"><button className="primary-button" onClick={() => setApprovalQueueOpen(false)} type="button">Fechar</button></footer>
          </section>
        </div>
      )}
    </div>
  );
}

function InstructionEditor({ form, onChange, onQrChange, qrFile }: { form: InstructionForm; onChange: (next: InstructionForm) => void; onQrChange: (file: File | null) => void; qrFile: File | null }) {
  const pix = form.paymentChannel === 'PIX';
  return (
    <div className="management-form financial-action-form">
      <div className="form-grid two-columns">
        <label>Canal de pagamento<select onChange={(event) => onChange({ ...form, paymentChannel: event.target.value as PaymentChannel })} value={form.paymentChannel}><option value="PIX">Pix</option><option value="BOLETO">Boleto</option><option value="CARD_LINK">Link de cartao</option><option value="BANK_TRANSFER">Transferencia</option><option value="OTHER">Outro</option></select></label>
        <label>Referencia ou link<input maxLength={500} onChange={(event) => onChange({ ...form, paymentReference: event.target.value })} value={form.paymentReference} /></label>
        {pix && <><label>Tipo da chave<select onChange={(event) => onChange({ ...form, pixKeyType: event.target.value as InstructionForm['pixKeyType'] })} value={form.pixKeyType}><option value="">Sem chave avulsa</option><option value="CPF">CPF</option><option value="CNPJ">CNPJ</option><option value="EMAIL">E-mail</option><option value="PHONE">Telefone</option><option value="RANDOM">Chave aleatoria</option></select></label><label>Chave Pix<input maxLength={160} onChange={(event) => onChange({ ...form, pixKey: event.target.value })} value={form.pixKey} /></label><label>Beneficiario<input maxLength={160} onChange={(event) => onChange({ ...form, beneficiaryName: event.target.value })} value={form.beneficiaryName} /></label><label>CPF ou CNPJ do beneficiario<input maxLength={18} onChange={(event) => onChange({ ...form, beneficiaryDocument: event.target.value })} value={form.beneficiaryDocument} /></label><label className="full-span">Pix copia e cola<textarea maxLength={1000} onChange={(event) => onChange({ ...form, pixCopyPaste: event.target.value })} rows={4} value={form.pixCopyPaste} /></label><label className="file-field full-span"><span>Imagem opcional do QR Pix</span><input accept="image/png,image/jpeg" onChange={(event) => onQrChange(event.target.files?.[0] ?? null)} type="file" /><small>{qrFile?.name ?? 'PNG ou JPEG, ate 5 MB'}</small></label></>}
        <label className="full-span">Observacoes<textarea maxLength={500} onChange={(event) => onChange({ ...form, notes: event.target.value })} rows={3} value={form.notes} /></label>
      </div>
    </div>
  );
}

function TitleDetail({
  card,
  onOpenAdvanceEvidence,
}: {
  card: PayableKanbanCard;
  onOpenAdvanceEvidence: () => void;
}) {
  return (
    <div className="purchase-detail-content financial-detail">
      <div className="purchase-detail-summary"><span><small>Fornecedor</small><strong>{card.supplierName}</strong></span><span><small>Etapa</small><strong>{stageLabel(card.stage)}</strong></span><span><small>Valor</small><strong>{currency.format(card.amount)}</strong></span><span><small>Saldo</small><strong>{currency.format(card.balance)}</strong></span><span><small>Vencimento</small><strong>{formatDate(card.dueDate)}</strong></span><span><small>Recebimento</small><strong>{card.received ? 'Confirmado' : 'Pendente'}</strong></span></div>
      <section className="purchase-detail-section"><header><strong>Documentos e instrucao</strong><span>{card.invoiceNumbers.length} nota(s)</span></header><p>{card.invoiceNumbers.length ? `NF ${card.invoiceNumbers.join(', ')}` : card.fiscalDocumentRequired ? 'Nenhuma NF-e conciliada.' : 'Documento fiscal nao exigido neste pedido.'}</p><p>{card.instruction ? `${channelLabel(card.instruction.paymentChannel)} | Instrucao v${card.instruction.version}` : 'Instrucao de pagamento ainda nao cadastrada.'}</p>{card.instruction?.validationWarnings.map((warning) => <small className="validation-warning" key={warning}>{warning}</small>)}</section>
      {card.advancePayment && <section className="purchase-detail-section"><header><strong>Adiantamento extraordinario</strong><span>Duas aprovacoes</span></header><p>{card.advanceReason}</p>{card.hasAdvanceEvidence && <button className="secondary-button" onClick={onOpenAdvanceEvidence} type="button"><ExternalLink size={16} />Abrir documento de suporte</button>}</section>}
      <section className="purchase-detail-section"><header><strong>Baixas</strong><span>{card.settlements.length}</span></header>{card.settlements.length ? card.settlements.map((settlement) => <p key={settlement.id}>{formatDate(settlement.paidAt)} | {currency.format(settlement.amount)} | {settlement.transactionId}</p>) : <p className="detail-empty">Nenhuma baixa registrada.</p>}</section>
    </div>
  );
}

function FinancialTable({ cards, onOpen }: { cards: PayableKanbanCard[]; onOpen: (card: PayableKanbanCard) => void }) {
  return <section className="panel table-panel"><div className="table-scroll"><table><thead><tr><th>Pedido</th><th>Fornecedor</th><th>Vencimento</th><th>Etapa</th><th>NF-e</th><th className="align-right">Saldo</th><th className="align-right">Acoes</th></tr></thead><tbody>{cards.map((card) => <tr key={card.id}><td><strong>{card.purchaseNumber}</strong><small className="table-secondary">Parcela {card.sequence}</small></td><td>{card.supplierName}</td><td>{formatDate(card.dueDate)}</td><td><span className={`status-label ${stageTone(card.stage)}`}>{stageLabel(card.stage)}</span></td><td>{card.invoiceNumbers.join(', ') || (card.fiscalDocumentRequired ? 'Pendente' : 'Nao exigida')}</td><td className="align-right amount-cell">{currency.format(card.balance)}</td><td className="align-right"><button className="icon-button table-action" onClick={() => onOpen(card)} title="Abrir titulo" type="button"><PencilLine size={16} /></button></td></tr>)}{!cards.length && <tr><td className="empty-table-cell" colSpan={7}>Nenhum titulo encontrado</td></tr>}</tbody></table></div></section>;
}

function Metric({ label, tone, value }: { label: string; tone?: 'danger'; value: number }) {
  return <div className={`payable-metric ${tone ?? ''}`}><small>{label}</small><strong>{currency.format(value)}</strong></div>;
}

function instructionFromCard(card: PayableKanbanCard, suppliers: Supplier[]): InstructionForm {
  const existing = card.instruction;
  const supplier = suppliers.find((candidate) => candidate.id === card.supplierId);
  return {
    paymentChannel: existing?.paymentChannel ?? 'PIX',
    paymentReference: existing?.paymentReference ?? '',
    pixKeyType: existing?.pixKeyType ?? supplier?.pixKeyType ?? '',
    pixKey: existing?.pixKey ?? supplier?.pixKey ?? '',
    beneficiaryName: existing?.beneficiaryName ?? supplier?.pixBeneficiaryName ?? '',
    beneficiaryDocument: existing?.beneficiaryDocument ?? supplier?.pixBeneficiaryDocument ?? '',
    pixCopyPaste: existing?.pixCopyPaste ?? '',
    notes: existing?.notes ?? '',
  };
}

function emptyInstruction(): InstructionForm {
  return { beneficiaryDocument: '', beneficiaryName: '', notes: '', paymentChannel: 'PIX', paymentReference: '', pixCopyPaste: '', pixKey: '', pixKeyType: '' };
}

function stageLabel(stage: PaymentWorkflowStage): string {
  return { MATCHING_REQUIRED: 'A conciliar', AWAITING_APPROVAL: 'Aguardando aprovacao', READY_TO_PAY: 'Liberado para pagamento', PARTIALLY_PAID: 'Parcialmente pago', PAID: 'Pago', CANCELLED: 'Cancelado' }[stage];
}

function stageTone(stage: PaymentWorkflowStage): string {
  return { MATCHING_REQUIRED: 'warning', AWAITING_APPROVAL: 'warning', READY_TO_PAY: 'info', PARTIALLY_PAID: 'info', PAID: 'active', CANCELLED: 'cancelled' }[stage];
}

function channelLabel(channel: PaymentChannel): string {
  return { PIX: 'Pix', BOLETO: 'Boleto', CARD_LINK: 'Link de cartao', BANK_TRANSFER: 'Transferencia', OTHER: 'Outro' }[channel];
}

function queryString(filters: PayableKanbanFilters): string {
  const query = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => { if (value) query.set(key, value); });
  const text = query.toString();
  return text ? `?${text}` : '';
}

function mergeCards(current: PayableKanbanCard[], updated: PayableKanbanCard[]): PayableKanbanCard[] {
  const byId = new Map(updated.map((card) => [card.id, card]));
  return current.map((card) => byId.get(card.id) ?? card);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${value}T00:00:00.000Z`));
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Nao foi possivel atualizar o fluxo financeiro.';
}
