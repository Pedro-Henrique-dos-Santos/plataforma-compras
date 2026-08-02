import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type {
  ChangePurchaseStatusInput,
  ChangePurchaseWorkflowStageInput,
  ApprovalSettings,
  CostCenter,
  CreatePurchaseInput,
  CreateGoodsReceiptInput,
  GoodsReceipt,
  PayableKanbanCard,
  PurchaseDetail,
  PurchaseStatus,
  PurchaseSummary,
  PurchaseWorkflowStage,
  ReceiptFiscalItemOption,
  Supplier,
  UpdatePurchaseInput,
} from '@compras/contracts';
import {
  BadgeCheck,
  Banknote,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  CircleX,
  FileCheck2,
  GitBranch,
  History,
  Pencil,
  PackageCheck,
  Plus,
  Columns3,
  Download,
  List,
  ReceiptText,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react';

import { apiGet, apiPatch, apiPost } from '../lib/api';
import { PurchaseAuditDialog } from './PurchaseAuditDialog';

type PurchasesViewProps = {
  accessToken: string | null;
  canManageWorkflow: boolean;
  canWrite: boolean;
  onChanged: () => void;
  organizationId: string;
};

type AllocationRow = { costCenterId: string; id: string; percentage: string };
type PurchaseItemRow = {
  allocations: AllocationRow[];
  costCenterId: string;
  description: string;
  id: string;
  negotiatedPrice: string;
  quantity: string;
  unit: string;
  unitPrice: string;
};
type InstallmentRow = {
  amount: string;
  dueDate: string;
  id: string;
  paidAt: string | null;
  paymentChannel: '' | 'PIX' | 'CARD_LINK' | 'BOLETO' | 'BANK_TRANSFER' | 'OTHER';
  paymentReference: string;
  paymentNotes: string;
};
type PurchaseForm = {
  category: string;
  fiscalDocumentRequired: boolean;
  invoiceNumber: string;
  issuedAt: string;
  notes: string;
  number: string;
  operationNature: string;
  paymentMethod: string;
  supplierId: string;
};

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const percentage = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function PurchasesView({
  accessToken,
  canManageWorkflow,
  canWrite,
  onChanged,
  organizationId,
}: PurchasesViewProps) {
  const [purchases, setPurchases] = useState<PurchaseSummary[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [payables, setPayables] = useState<PayableKanbanCard[]>([]);
  const [approvalSettings, setApprovalSettings] = useState<ApprovalSettings>({
    financeChannel: null,
    financeRecipient: null,
    notifyFinanceOnApproval: false,
    requireStageReturnReason: false,
    updatedAt: null,
  });
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'ALL' | PurchaseStatus>('ALL');
  const [viewMode, setViewMode] = useState<'KANBAN' | 'TABLE'>('KANBAN');
  const [showCompletedInKanban, setShowCompletedInKanban] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PurchaseDetail | null>(null);
  const [detailPurchase, setDetailPurchase] = useState<PurchaseDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [goodsReceipts, setGoodsReceipts] = useState<GoodsReceipt[]>([]);
  const [receiptPurchase, setReceiptPurchase] = useState<PurchaseDetail | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptDate, setReceiptDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [receiptNotes, setReceiptNotes] = useState('');
  const [receiptQuantities, setReceiptQuantities] = useState<Record<string, string>>({});
  const [receiptFiscalItems, setReceiptFiscalItems] = useState<ReceiptFiscalItemOption[]>([]);
  const [receiptFiscalSelections, setReceiptFiscalSelections] = useState<Record<string, string>>({});
  const [lifecyclePurchase, setLifecyclePurchase] = useState<PurchaseDetail | null>(null);
  const [lifecycleReason, setLifecycleReason] = useState('');
  const [lifecycleOpen, setLifecycleOpen] = useState(false);
  const [moving, setMoving] = useState<{
    purchase: PurchaseSummary;
    target: PurchaseWorkflowStage;
  } | null>(null);
  const [moveReason, setMoveReason] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<PurchaseWorkflowStage | null>(null);
  const [form, setForm] = useState<PurchaseForm>(newPurchaseForm());
  const [items, setItems] = useState<PurchaseItemRow[]>([newPurchaseItem()]);
  const [installments, setInstallments] = useState<InstallmentRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [openingFiscalDocumentId, setOpeningFiscalDocumentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void Promise.all([
      apiGet<PurchaseSummary[]>('/purchases', { token: accessToken, organizationId, signal: controller.signal }),
      apiGet<Supplier[]>('/suppliers', { token: accessToken, organizationId, signal: controller.signal }),
      apiGet<CostCenter[]>('/cost-centers?includeInactive=true', { token: accessToken, organizationId, signal: controller.signal }),
      apiGet<PayableKanbanCard[]>('/procure-to-pay/payables', { token: accessToken, organizationId, signal: controller.signal }),
      apiGet<ApprovalSettings>('/approvals/settings', { token: accessToken, organizationId, signal: controller.signal }),
    ])
      .then(([purchaseRows, supplierRows, centerRows, payableRows, nextApprovalSettings]) => {
        setPurchases(purchaseRows);
        setSuppliers(supplierRows);
        setCostCenters(centerRows);
        setPayables(payableRows);
        setApprovalSettings({
          ...nextApprovalSettings,
          requireStageReturnReason:
            nextApprovalSettings.requireStageReturnReason ?? false,
        });
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [accessToken, organizationId, revision]);

  const visiblePurchases = useMemo(() => {
    const term = normalize(search);
    return purchases.filter((purchase) => {
      if (status !== 'ALL' && purchase.status !== status) return false;
      const content = `${purchase.displayNumber} ${purchase.number} ${purchase.supplierName} ${purchase.category ?? ''} ${purchase.departments.join(' ')}`;
      return !term || normalize(content).includes(term);
    });
  }, [purchases, search, status]);
  const completedPurchases = useMemo(
    () => visiblePurchases.filter((purchase) => purchase.workflowStage === 'COMPLETED'),
    [visiblePurchases],
  );
  const kanbanPurchases = useMemo(
    () =>
      showCompletedInKanban
        ? visiblePurchases
        : visiblePurchases.filter((purchase) => purchase.workflowStage !== 'COMPLETED'),
    [showCompletedInKanban, visiblePurchases],
  );
  const kanbanStages = showCompletedInKanban
    ? workflowStages
    : workflowStages.filter((stage) => stage !== 'COMPLETED');

  const selectedSupplier = suppliers.find((supplier) => supplier.id === form.supplierId) ?? null;
  const totals = useMemo(() => calculateTotals(items), [items]);
  const financialByPurchase = useMemo(() => summarizePayables(payables), [payables]);
  const detailFinancial = detailPurchase
    ? financialByPurchase.get(detailPurchase.id)
    : undefined;
  const detailNegotiation = detailPurchase
    ? purchaseNegotiationMetrics(
        detailPurchase.total,
        detailPurchase.negotiatedSavings,
      )
    : null;

  function openCreate() {
    setEditing(null);
    setForm({
      ...newPurchaseForm(),
      supplierId: suppliers.find((supplier) => supplier.status === 'ACTIVE')?.id ?? '',
    });
    setItems([newPurchaseItem()]);
    setInstallments([]);
    setError(null);
    setDialogOpen(true);
  }

  async function openEdit(purchase: PurchaseSummary) {
    setPendingId(purchase.id);
    setError(null);
    try {
      const detail = await apiGet<PurchaseDetail>(`/purchases/${purchase.id}`, {
        token: accessToken,
        organizationId,
      });
      const editor = purchaseDetailToEditor(detail);
      setEditing(detail);
      setForm(editor.form);
      setItems(editor.items);
      setInstallments(editor.installments);
      setDialogOpen(true);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setPendingId(null);
    }
  }

  async function openLifecycle(purchase: PurchaseSummary) {
    setPendingId(purchase.id);
    setError(null);
    try {
      const detail = await apiGet<PurchaseDetail>(`/purchases/${purchase.id}`, {
        token: accessToken,
        organizationId,
      });
      setLifecyclePurchase(detail);
      setLifecycleReason('');
      setLifecycleOpen(true);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setPendingId(null);
    }
  }

  function formField<K extends keyof PurchaseForm>(key: K, value: PurchaseForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function itemField(id: string, field: keyof Omit<PurchaseItemRow, 'id' | 'allocations'>, value: string) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item));
  }

  function enableAllocations(id: string) {
    const firstActiveCenter = costCenters.find((center) => center.active);
    setItems((current) => current.map((item) => item.id === id ? {
      ...item,
      costCenterId: '',
      allocations: [{ id: crypto.randomUUID(), costCenterId: firstActiveCenter?.id ?? '', percentage: '100' }],
    } : item));
  }

  function disableAllocations(id: string) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, allocations: [] } : item));
  }

  function addAllocation(itemId: string) {
    setItems((current) => current.map((item) => {
      if (item.id !== itemId) return item;
      return { ...item, allocations: equalize([...item.allocations, { id: crypto.randomUUID(), costCenterId: '', percentage: '0' }]) };
    }));
  }

  function updateAllocation(itemId: string, allocationId: string, field: 'costCenterId' | 'percentage', value: string) {
    setItems((current) => current.map((item) => item.id === itemId ? {
      ...item,
      allocations: item.allocations.map((allocation) => allocation.id === allocationId ? { ...allocation, [field]: value } : allocation),
    } : item));
  }

  function removeAllocation(itemId: string, allocationId: string) {
    setItems((current) => current.map((item) => {
      if (item.id !== itemId) return item;
      const remaining = item.allocations.filter((allocation) => allocation.id !== allocationId);
      return { ...item, allocations: remaining.length ? equalize(remaining) : [] };
    }));
  }

  function addInstallment() {
    setInstallments((current) => [...current, {
      amount: '',
      dueDate: form.issuedAt,
      id: crypto.randomUUID(),
      paidAt: null,
      paymentChannel: '',
      paymentReference: '',
      paymentNotes: '',
    }]);
  }

  async function openDetails(purchase: PurchaseSummary) {
    setPendingId(purchase.id);
    setError(null);
    try {
      const [detail, receipts] = await Promise.all([
        apiGet<PurchaseDetail>(`/purchases/${purchase.id}`, {
          token: accessToken,
          organizationId,
        }),
        apiGet<GoodsReceipt[]>(`/procure-to-pay/purchases/${purchase.id}/receipts`, {
          token: accessToken,
          organizationId,
        }),
      ]);
      setDetailPurchase(detail);
      setGoodsReceipts(receipts);
      setDetailOpen(true);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setPendingId(null);
    }
  }

  function editOpenPurchase() {
    if (!detailPurchase) return;
    const editor = purchaseDetailToEditor(detailPurchase);
    setEditing(detailPurchase);
    setForm(editor.form);
    setItems(editor.items);
    setInstallments(editor.installments);
    setError(null);
    setDetailOpen(false);
    setDialogOpen(true);
  }

  async function openFiscalDocument(documentId: string) {
    setOpeningFiscalDocumentId(documentId);
    setError(null);
    try {
      const access = await apiGet<{ expiresAt: string; url: string }>(
        `/procure-to-pay/fiscal/documents/${documentId}/file-url`,
        { token: accessToken, organizationId },
      );
      window.open(access.url, '_blank', 'noopener,noreferrer');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setOpeningFiscalDocumentId(null);
    }
  }

  async function openReceipt(purchase: PurchaseDetail) {
    setPendingId(purchase.id);
    setError(null);
    try {
      const fiscalItems = await apiGet<ReceiptFiscalItemOption[]>(
        `/procure-to-pay/purchases/${purchase.id}/receipt-fiscal-items`,
        { token: accessToken, organizationId },
      );
      const received = receivedQuantityByItem(goodsReceipts);
      const selections: Record<string, string> = {};
      const quantities: Record<string, string> = {};
      for (const item of purchase.items) {
        const purchaseRemaining = Math.max(
          0,
          item.quantity - (received.get(item.id) ?? 0),
        );
        const available = fiscalItems.filter(
          (fiscalItem) =>
            fiscalItem.purchaseItemId === item.id && fiscalItem.remainingQuantity > 0.0001,
        );
        if (available.length === 1) {
          selections[item.id] = available[0]!.id;
          quantities[item.id] = editableNumber(
            Math.min(purchaseRemaining, available[0]!.remainingQuantity),
          );
        } else {
          quantities[item.id] = available.length
            ? ''
            : editableNumber(purchaseRemaining);
        }
      }
      setReceiptPurchase(purchase);
      setReceiptFiscalItems(fiscalItems);
      setReceiptFiscalSelections(selections);
      setReceiptDate(new Date().toISOString().slice(0, 10));
      setReceiptNotes('');
      setReceiptQuantities(quantities);
      setDetailOpen(false);
      setReceiptOpen(true);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setPendingId(null);
    }
  }

  async function saveReceipt() {
    if (!receiptPurchase) return;
    const receiptItems = receiptPurchase.items
      .map((item) => ({
        purchaseItemId: item.id,
        invoiceDocumentItemId: receiptFiscalSelections[item.id] || null,
        quantity: Number((receiptQuantities[item.id] ?? '').replace(',', '.')),
      }))
      .filter((item) => Number.isFinite(item.quantity) && item.quantity > 0);
    if (!receiptItems.length) {
      setError('Informe ao menos uma quantidade recebida.');
      return;
    }
    const itemWithoutFiscalSelection = receiptItems.find(
      (item) =>
        receiptFiscalItems.some(
          (fiscalItem) => fiscalItem.purchaseItemId === item.purchaseItemId,
        ) && !item.invoiceDocumentItemId,
    );
    if (itemWithoutFiscalSelection) {
      setError('Selecione a NF-e correspondente para cada quantidade recebida.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const input: CreateGoodsReceiptInput = {
        expectedPurchaseUpdatedAt: receiptPurchase.updatedAt,
        receivedAt: receiptDate,
        notes: receiptNotes.trim() || null,
        items: receiptItems,
      };
      await apiPost<GoodsReceipt>(
        `/procure-to-pay/purchases/${receiptPurchase.id}/receipts`,
        input,
        { token: accessToken, organizationId },
      );
      const [detail, receipts] = await Promise.all([
        apiGet<PurchaseDetail>(`/purchases/${receiptPurchase.id}`, {
          token: accessToken,
          organizationId,
        }),
        apiGet<GoodsReceipt[]>(
          `/procure-to-pay/purchases/${receiptPurchase.id}/receipts`,
          { token: accessToken, organizationId },
        ),
      ]);
      setPurchases((current) => replacePurchase(current, detail));
      setDetailPurchase(detail);
      setGoodsReceipts(receipts);
      setReceiptOpen(false);
      setReceiptPurchase(null);
      setReceiptFiscalItems([]);
      setReceiptFiscalSelections({});
      setDetailOpen(true);
      setRevision((current) => current + 1);
      onChanged();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function requestMove(
    purchase: PurchaseSummary,
    target: PurchaseWorkflowStage,
  ) {
    const backwards =
      workflowStageIndex(target) < workflowStageIndex(purchase.workflowStage);
    if (backwards && approvalSettings.requireStageReturnReason) {
      setMoving({ purchase, target });
      setMoveReason('');
      setError(null);
      return;
    }
    await movePurchase(purchase, target, null);
  }

  async function movePurchase(
    purchase: PurchaseSummary,
    target: PurchaseWorkflowStage,
    reason: string | null,
  ) {
    setPendingId(purchase.id);
    setError(null);
    setPurchases((current) =>
      current.map((candidate) =>
        candidate.id === purchase.id
          ? {
              ...candidate,
              workflowStage: target,
              status:
                workflowStageIndex(target) >= workflowStageIndex('PURCHASE_ORDER')
                  ? 'REGISTERED'
                  : 'DRAFT',
            }
          : candidate,
      ),
    );
    try {
      const updated =
        target === 'AWAITING_APPROVAL'
          ? await apiPost<PurchaseDetail>(
              `/purchases/${purchase.id}/submit-approval`,
              { expectedUpdatedAt: purchase.updatedAt },
              { token: accessToken, organizationId },
            )
          : await apiPatch<PurchaseDetail>(
              `/purchases/${purchase.id}/workflow`,
              {
                expectedUpdatedAt: purchase.updatedAt,
                stage: target,
                reason,
              } satisfies ChangePurchaseWorkflowStageInput,
              { token: accessToken, organizationId },
            );
      setPurchases((current) => replacePurchase(current, updated));
      setMoving(null);
      setRevision((current) => current + 1);
      onChanged();
    } catch (requestError) {
      setPurchases((current) => replacePurchase(current, purchase));
      setError(errorMessage(requestError));
    } finally {
      setPendingId(null);
    }
  }

  function updateInstallment(
    id: string,
    field: 'amount' | 'dueDate' | 'paymentChannel' | 'paymentReference',
    value: string,
  ) {
    setInstallments((current) => current.map((installment) => installment.id === id ? { ...installment, [field]: value } : installment));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      if (editing) {
        const updated = await apiPatch<PurchaseDetail>(
          `/purchases/${editing.id}`,
          toUpdatePurchaseInput(form, items, installments, editing.updatedAt),
          { token: accessToken, organizationId },
        );
        setPurchases((current) => replacePurchase(current, updated));
      } else {
        const created = await apiPost<PurchaseSummary>(
          '/purchases',
          toCreatePurchaseInput(form, items, installments),
          { token: accessToken, organizationId },
        );
        setPurchases((current) => [created, ...current]);
      }
      setDialogOpen(false);
      setRevision((current) => current + 1);
      onChanged();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function changeLifecycle() {
    if (!lifecyclePurchase) return;
    const nextStatus = lifecyclePurchase.status === 'CANCELLED' ? 'REGISTERED' : 'CANCELLED';
    setSubmitting(true);
    setError(null);
    try {
      const input: ChangePurchaseStatusInput = {
        expectedUpdatedAt: lifecyclePurchase.updatedAt,
        status: nextStatus,
        reason: lifecycleReason.trim(),
      };
      const updated = await apiPatch<PurchaseSummary>(
        `/purchases/${lifecyclePurchase.id}/status`,
        input,
        { token: accessToken, organizationId },
      );
      setPurchases((current) => replacePurchase(current, updated));
      setLifecycleOpen(false);
      setLifecyclePurchase(null);
      setRevision((current) => current + 1);
      onChanged();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="management-layout purchase-workspace">
      <section className="section-heading">
        <span><p className="eyebrow">Operacao de compras</p><h2>Lancamentos registrados</h2></span>
        <span className="heading-actions">
          <span className="segmented-control" aria-label="Visualizacao de compras">
            <button aria-pressed={viewMode === 'KANBAN'} onClick={() => setViewMode('KANBAN')} title="Kanban" type="button"><Columns3 size={16} /><span>Kanban</span></button>
            <button aria-pressed={viewMode === 'TABLE'} onClick={() => setViewMode('TABLE')} title="Tabela" type="button"><List size={16} /><span>Tabela</span></button>
          </span>
          <button className="secondary-button" onClick={() => setAuditOpen(true)} type="button">
            <History size={16} />Historico
          </button>
          {canWrite && <button className="primary-button" onClick={openCreate} type="button"><Plus size={16} />Nova compra</button>}
        </span>
      </section>

      <section className="filter-bar panel">
        <label className="search-field"><Search size={16} /><span className="sr-only">Buscar compra</span><input onChange={(event) => setSearch(event.target.value)} placeholder="Pedido, fornecedor, categoria ou departamento" value={search} /></label>
        <label className="compact-select"><span className="sr-only">Filtrar por status</span><select onChange={(event) => setStatus(event.target.value as typeof status)} value={status}><option value="ALL">Todos os status</option><option value="REGISTERED">Registradas</option><option value="CANCELLED">Canceladas</option><option value="DRAFT">Rascunhos</option></select></label>
        {viewMode === 'KANBAN' && (
          <label className="kanban-history-toggle">
            <input
              checked={showCompletedInKanban}
              onChange={(event) => setShowCompletedInKanban(event.target.checked)}
              type="checkbox"
            />
            <span>Exibir concluidos</span>
          </label>
        )}
        <span className="count-label">
          {viewMode === 'KANBAN'
            ? `${kanbanPurchases.length} no fluxo${
                !showCompletedInKanban && completedPurchases.length
                  ? ` | ${completedPurchases.length} concluidos ocultos`
                  : ''
              }`
            : `${visiblePurchases.length} compras`}
        </span>
      </section>

      {error && !dialogOpen && !detailOpen && !lifecycleOpen && !receiptOpen && (
        <div className="inline-error">{error}</div>
      )}

      {viewMode === 'KANBAN' ? (
        loading ? <div className="panel table-loading">Carregando compras</div> : (
          <section className="purchase-kanban" aria-label="Fluxo das compras">
            {kanbanStages.map((stage) => {
              const stagePurchases = kanbanPurchases.filter((purchase) => purchase.workflowStage === stage);
              const draggedPurchase = purchases.find(
                (candidate) => candidate.id === draggingId,
              );
              const acceptsDrop = Boolean(
                draggedPurchase && canMoveTo(draggedPurchase, stage, canManageWorkflow),
              );
              return (
                <section
                  className={`kanban-lane ${dragOverStage === stage && acceptsDrop ? 'drop-target' : ''}`}
                  key={stage}
                  onDragEnter={() => setDragOverStage(acceptsDrop ? stage : null)}
                  onDragOver={(event) => {
                    if (acceptsDrop) {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const purchase = purchases.find((candidate) => candidate.id === event.dataTransfer.getData('text/purchase-id'));
                    setDragOverStage(null);
                    setDraggingId(null);
                    if (purchase && canMoveTo(purchase, stage, canManageWorkflow)) void requestMove(purchase, stage);
                  }}
                >
                  <header className="kanban-lane-header">
                    <strong>{workflowStageLabel(stage)}</strong>
                    <span>{stagePurchases.length}</span>
                  </header>
                  <div className="kanban-card-list">
                    {stagePurchases.map((purchase) => {
                      const previous = previousWorkflowStage(purchase.workflowStage);
                      const next = nextWorkflowStage(purchase.workflowStage);
                      const editable = canEditPurchase(purchase, canManageWorkflow);
                      const financial = financialByPurchase.get(purchase.id);
                      const negotiation = purchaseNegotiationMetrics(
                        purchase.total,
                        purchase.negotiatedSavings,
                      );
                      return (
                        <article
                          className={`purchase-kanban-card ${purchase.status === 'CANCELLED' ? 'cancelled' : ''} ${draggingId === purchase.id ? 'dragging' : ''}`}
                          draggable={
                            canWrite &&
                            purchase.status !== 'CANCELLED' &&
                            workflowStages.some((target) =>
                              canMoveTo(purchase, target, canManageWorkflow),
                            )
                          }
                          key={purchase.id}
                          onDoubleClick={(event) => {
                            if (
                              pendingId !== purchase.id &&
                              shouldOpenPurchaseOnDoubleClick(event.target)
                            ) {
                              void openDetails(purchase);
                            }
                          }}
                          onDragEnd={() => {
                            setDraggingId(null);
                            setDragOverStage(null);
                          }}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = 'move';
                            event.dataTransfer.setData('text/purchase-id', purchase.id);
                            setDraggingId(purchase.id);
                          }}
                          title="Abrir pedido"
                        >
                          <header>
                            <span>
                              <strong>Pedido #{purchase.displayNumber}</strong>
                              <small>{formatDate(purchase.issuedAt)}</small>
                            </span>
                            {purchase.invoiceLinked && <span className="invoice-badge">NF</span>}
                          </header>
                          <p>{purchase.supplierName}</p>
                          <div className="kanban-negotiation-summary">
                            <span>
                              <small>Valor inicial</small>
                              <strong>{currency.format(negotiation.initialValue)}</strong>
                            </span>
                            <span>
                              <small>Valor negociado</small>
                              <strong>{currency.format(negotiation.negotiatedValue)}</strong>
                            </span>
                            <span className="kanban-savings-summary">
                              <small>Economia</small>
                              <strong>
                                {currency.format(negotiation.savings)} |{' '}
                                {percentage.format(negotiation.savingsPercentage)}%
                              </strong>
                            </span>
                          </div>
                          <small>{purchase.departments.join(', ') || 'Sem centro de custo'}</small>
                          {financial && (
                            <div className="purchase-financial-status">
                              <span><PackageCheck size={13} />{financial.received ? 'Recebido' : 'Recebimento pendente'}</span>
                              <span><FileCheck2 size={13} />{financial.invoiceCount} NF-e</span>
                              <span><Banknote size={13} />{currency.format(financial.balance)} em aberto</span>
                            </div>
                          )}
                          {purchase.approval && (
                            <div className={`kanban-approval ${purchase.approval.status.toLowerCase()}`}>
                              <span>{purchase.approval.ruleName}</span>
                              <strong>{purchase.approval.approvedCount}/{purchase.approval.requiredApprovals}</strong>
                            </div>
                          )}
                          {purchase.approval?.status === 'APPROVED' && purchase.approval.approvedBy.length > 0 && (
                            <div className="kanban-approved-by">
                              <BadgeCheck size={15} />
                              <span>Aprovado por <strong>{approvedByLabel(purchase.approval.approvedBy)}</strong></span>
                            </div>
                          )}
                          <footer>
                            <button
                              aria-label="Ver detalhes"
                              className="icon-button table-action"
                              disabled={pendingId === purchase.id}
                              onClick={() => void openDetails(purchase)}
                              title="Ver detalhes e historico"
                              type="button"
                            >
                              <ReceiptText size={15} />
                            </button>
                            {canWrite && (
                              <>
                                <button
                                  aria-label="Voltar etapa"
                                  className="icon-button table-action"
                                  disabled={
                                    !previous ||
                                    !canMoveTo(purchase, previous, canManageWorkflow) ||
                                    pendingId === purchase.id ||
                                    purchase.status === 'CANCELLED'
                                  }
                                  onClick={() => previous && void requestMove(purchase, previous)}
                                  title={previous ? `Voltar para ${workflowStageLabel(previous)}` : 'Primeira etapa'}
                                  type="button"
                                >
                                  <ChevronLeft size={16} />
                                </button>
                                <button
                                  aria-label="Editar compra"
                                  className="icon-button table-action"
                                  disabled={!editable || pendingId === purchase.id}
                                  onClick={() => void openEdit(purchase)}
                                  title={editable ? 'Editar compra' : 'Edicao encerrada apos envio para aprovacao'}
                                  type="button"
                                >
                                  <Pencil size={15} />
                                </button>
                                <button
                                  aria-label="Avancar etapa"
                                  className="icon-button table-action"
                                  disabled={
                                    !next ||
                                    !canMoveTo(purchase, next, canManageWorkflow) ||
                                    pendingId === purchase.id ||
                                    purchase.status === 'CANCELLED'
                                  }
                                  onClick={() => next && void requestMove(purchase, next)}
                                  title={next ? `Avancar para ${workflowStageLabel(next)}` : 'Ultima etapa'}
                                  type="button"
                                >
                                  <ChevronRight size={16} />
                                </button>
                                <button
                                  aria-label={purchase.status === 'CANCELLED' ? 'Reativar compra' : 'Cancelar compra'}
                                  className={`icon-button table-action ${purchase.status === 'CANCELLED' ? '' : 'danger-icon'}`}
                                  disabled={pendingId === purchase.id}
                                  onClick={() => void openLifecycle(purchase)}
                                  title={purchase.status === 'CANCELLED' ? 'Reativar compra' : 'Cancelar compra'}
                                  type="button"
                                >
                                  {purchase.status === 'CANCELLED' ? <RotateCcw size={15} /> : <CircleX size={15} />}
                                </button>
                              </>
                            )}
                          </footer>
                        </article>
                      );
                    })}
                    {!stagePurchases.length && <p className="kanban-empty">Nenhum pedido</p>}
                  </div>
                </section>
              );
            })}
          </section>
        )
      ) : (
        <section className="panel table-panel">
          {loading ? <div className="table-loading">Carregando compras</div> : (
            <div className="table-scroll">
              <table>
                <thead><tr><th>Pedido</th><th>Fornecedor</th><th>Departamentos</th><th>Itens</th><th>Data</th><th>Etapa</th><th className="align-right">Economia</th><th className="align-right">Total</th><th className="align-right">Acoes</th></tr></thead>
                <tbody>
                  {visiblePurchases.length ? visiblePurchases.map((purchase) => (
                    <tr
                      className={purchase.status === 'CANCELLED' ? 'purchase-row-cancelled' : undefined}
                      key={purchase.id}
                      onDoubleClick={(event) => {
                        if (
                          pendingId !== purchase.id &&
                          shouldOpenPurchaseOnDoubleClick(event.target)
                        ) {
                          void openDetails(purchase);
                        }
                      }}
                      title="Abrir pedido"
                    >
                      <td className="order-id"><strong>Pedido #{purchase.displayNumber}</strong><small>{purchase.invoiceNumber ? `NF ${purchase.invoiceNumber}` : 'Sem nota vinculada'}</small></td>
                      <td>{purchase.supplierName}</td>
                      <td>{purchase.departments.join(', ') || 'Nao classificado'}</td>
                      <td>{purchase.itemCount}</td>
                      <td>{formatDate(purchase.issuedAt)}</td>
                      <td><span className={`status-label ${purchase.status === 'CANCELLED' ? 'cancelled' : purchase.workflowStage === 'COMPLETED' ? 'active' : 'warning'}`}>{purchase.status === 'CANCELLED' ? 'Cancelada' : workflowStageLabel(purchase.workflowStage)}</span></td>
                      <td className="align-right savings-cell">{currency.format(purchase.negotiatedSavings)}</td>
                      <td className="align-right amount-cell">{currency.format(purchase.total)}</td>
                      <td className="align-right table-actions-cell">
                        <button className="icon-button table-action" disabled={pendingId === purchase.id} onClick={() => void openDetails(purchase)} title="Ver detalhes e historico" type="button"><ReceiptText size={16} /></button>
                        {canWrite && (
                          <>
                          <button className="icon-button table-action" disabled={pendingId === purchase.id || !canEditPurchase(purchase, canManageWorkflow)} onClick={() => void openEdit(purchase)} title={canEditPurchase(purchase, canManageWorkflow) ? 'Editar compra' : 'Edicao encerrada apos envio para aprovacao'} type="button"><Pencil size={16} /></button>
                          <button className={`icon-button table-action ${purchase.status === 'CANCELLED' ? '' : 'danger-icon'}`} disabled={pendingId === purchase.id} onClick={() => void openLifecycle(purchase)} title={purchase.status === 'CANCELLED' ? 'Reativar compra' : 'Cancelar compra'} type="button">{purchase.status === 'CANCELLED' ? <RotateCcw size={16} /> : <CircleX size={16} />}</button>
                          </>
                        )}
                      </td>
                    </tr>
                  )) : <tr><td className="empty-table-cell" colSpan={9}>Nenhuma compra encontrada</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {dialogOpen && (
        <div className="modal-backdrop" role="presentation">
          <section aria-labelledby="purchase-title" aria-modal="true" className="modal-panel modal-extra-wide purchase-modal" role="dialog">
            <header className="modal-header">
              <span><p className="eyebrow">Operacao de compras</p><h2 id="purchase-title">{editing ? `Editar pedido #${editing.displayNumber}` : 'Registrar compra'}</h2></span>
              <button className="icon-button" onClick={() => setDialogOpen(false)} title="Fechar" type="button"><X size={18} /></button>
            </header>
            <form className="management-form purchase-form" onSubmit={(event) => void submit(event)}>
              <div className="form-grid three-columns">
                <label>Referencia original<input autoFocus maxLength={40} onChange={(event) => formField('number', event.target.value)} required value={form.number} /></label>
                <label>Data de emissao<input onChange={(event) => formField('issuedAt', event.target.value)} required={!editing} type="date" value={form.issuedAt} /></label>
                <label>Fornecedor<select onChange={(event) => formField('supplierId', event.target.value)} required value={form.supplierId}><option value="">Selecione</option>{suppliers.map((supplier) => <option disabled={supplier.status !== 'ACTIVE' && supplier.id !== form.supplierId} key={supplier.id} value={supplier.id}>{supplier.tradeName ?? supplier.legalName}{supplier.status !== 'ACTIVE' ? ' | Inativo' : ''}</option>)}</select></label>
                <label>Categoria<input maxLength={100} onChange={(event) => formField('category', event.target.value)} placeholder={selectedSupplier?.category ?? 'Automatica pelo fornecedor'} value={form.category} /></label>
                <label>Natureza da operacao<input maxLength={100} onChange={(event) => formField('operationNature', event.target.value)} placeholder={selectedSupplier?.operationNature ?? 'Automatica pelo fornecedor'} value={form.operationNature} /></label>
                <label>Metodo de pagamento<input maxLength={80} onChange={(event) => formField('paymentMethod', event.target.value)} placeholder={selectedSupplier?.paymentMethod ?? 'Nao informado'} value={form.paymentMethod} /></label>
                <label className="checkbox-field"><input checked={form.fiscalDocumentRequired} onChange={(event) => formField('fiscalDocumentRequired', event.target.checked)} type="checkbox" /><span><strong>Documento fiscal exigido</strong></span></label>
              </div>

              <section className="form-section">
                <header className="form-section-header"><span><strong>Itens da compra</strong><small>Centro em branco usa o cadastro do fornecedor</small></span><button className="secondary-button compact-button" onClick={() => setItems((current) => [...current, newPurchaseItem()])} type="button"><Plus size={15} />Adicionar item</button></header>
                <div className="purchase-items">
                  {items.map((item, itemIndex) => (
                    <div className="purchase-item-row" key={item.id}>
                      <div className="purchase-item-heading"><strong>Item {itemIndex + 1}</strong><button aria-label="Remover item" className="icon-button table-action" disabled={items.length === 1} onClick={() => setItems((current) => current.filter((candidate) => candidate.id !== item.id))} title="Remover item" type="button"><Trash2 size={16} /></button></div>
                      <div className="editable-grid purchase-item-grid">
                        <label>Descricao<input maxLength={240} onChange={(event) => itemField(item.id, 'description', event.target.value)} required value={item.description} /></label>
                        <label>Quantidade<input inputMode="decimal" onChange={(event) => itemField(item.id, 'quantity', event.target.value)} value={item.quantity} /></label>
                        <label>Unidade<input maxLength={30} onChange={(event) => itemField(item.id, 'unit', event.target.value.toUpperCase())} value={item.unit} /></label>
                        <label>Preco original<input inputMode="decimal" onChange={(event) => itemField(item.id, 'unitPrice', event.target.value)} placeholder="0,00" required value={item.unitPrice} /></label>
                        <label>Preco negociado<input inputMode="decimal" onChange={(event) => itemField(item.id, 'negotiatedPrice', event.target.value)} placeholder="Igual ao original" value={item.negotiatedPrice} /></label>
                        {item.allocations.length ? (
                          <button className="secondary-button allocation-mode-button" onClick={() => disableAllocations(item.id)} type="button"><GitBranch size={15} />Remover rateio</button>
                        ) : (
                          <label>Centro de custo<select onChange={(event) => itemField(item.id, 'costCenterId', event.target.value)} value={item.costCenterId}><option value="">Automatico do fornecedor</option>{costCenters.map((center) => <option disabled={!center.active && center.id !== item.costCenterId} key={center.id} value={center.id}>{center.code} | {center.name}{!center.active ? ' | Inativo' : ''}</option>)}</select></label>
                        )}
                      </div>
                      {!item.allocations.length && <button className="text-button allocation-trigger" disabled={!costCenters.some((center) => center.active)} onClick={() => enableAllocations(item.id)} type="button"><GitBranch size={15} />Ratear entre departamentos</button>}
                      {item.allocations.length > 0 && (
                        <div className="allocation-editor">
                          {item.allocations.map((allocation) => (
                            <div className="allocation-row" key={allocation.id}>
                              <label>Departamento<select onChange={(event) => updateAllocation(item.id, allocation.id, 'costCenterId', event.target.value)} required value={allocation.costCenterId}><option value="">Selecione</option>{costCenters.map((center) => <option disabled={!center.active && center.id !== allocation.costCenterId} key={center.id} value={center.id}>{center.code} | {center.name}{!center.active ? ' | Inativo' : ''}</option>)}</select></label>
                              <label>Percentual<input inputMode="decimal" max="100" min="0.01" onChange={(event) => updateAllocation(item.id, allocation.id, 'percentage', event.target.value)} required type="number" value={allocation.percentage} /></label>
                              <button aria-label="Remover rateio" className="icon-button table-action" onClick={() => removeAllocation(item.id, allocation.id)} title="Remover rateio" type="button"><Trash2 size={15} /></button>
                            </div>
                          ))}
                          <button className="add-row-button" onClick={() => addAllocation(item.id)} type="button"><Plus size={14} />Adicionar departamento</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <section className="form-section">
                <header className="form-section-header"><span><strong>Parcelas</strong><small>Opcional; deixe vazio quando nao houver informacao</small></span><button className="secondary-button compact-button" onClick={addInstallment} type="button"><CalendarPlus size={15} />Adicionar parcela</button></header>
                {installments.length > 0 && <div className="installment-list">{installments.map((installment, index) => <div className="installment-row extended" key={installment.id}><span>{index + 1}</span><label>Vencimento{installment.paidAt ? ` | Paga em ${formatDate(installment.paidAt)}` : ''}<input disabled={Boolean(installment.paidAt)} onChange={(event) => updateInstallment(installment.id, 'dueDate', event.target.value)} required type="date" value={installment.dueDate} /></label><label>Valor<input disabled={Boolean(installment.paidAt)} inputMode="decimal" onChange={(event) => updateInstallment(installment.id, 'amount', event.target.value)} placeholder="0,00" required value={installment.amount} /></label><label>Canal<select onChange={(event) => updateInstallment(installment.id, 'paymentChannel', event.target.value)} value={installment.paymentChannel}><option value="">Automatico do fornecedor</option><option value="PIX">Pix</option><option value="BOLETO">Boleto</option><option value="CARD_LINK">Link de cartao</option><option value="BANK_TRANSFER">Transferencia</option><option value="OTHER">Outro</option></select></label><label>Referencia<input maxLength={500} onChange={(event) => updateInstallment(installment.id, 'paymentReference', event.target.value)} value={installment.paymentReference} /></label><button aria-label="Remover parcela" className="icon-button table-action" disabled={Boolean(installment.paidAt)} onClick={() => setInstallments((current) => current.filter((candidate) => candidate.id !== installment.id))} title={installment.paidAt ? 'Parcelas pagas nao podem ser removidas' : 'Remover parcela'} type="button"><Trash2 size={15} /></button></div>)}</div>}
              </section>

              <label>Observacoes<textarea maxLength={2000} onChange={(event) => formField('notes', event.target.value)} rows={3} value={form.notes} /></label>

              <div className="purchase-total-band"><span><small>Valor inicial</small><strong>{currency.format(totals.total + totals.savings)}</strong></span><span><small>Valor negociado</small><strong>{currency.format(totals.total)}</strong></span><span><small>Economia negociada</small><strong>{currency.format(totals.savings)} | {percentage.format(totals.total + totals.savings > 0 ? (totals.savings / (totals.total + totals.savings)) * 100 : 0)}%</strong></span></div>
              {error && <div className="form-error">{error}</div>}
              <footer className="modal-actions"><button className="secondary-button" onClick={() => setDialogOpen(false)} type="button">Fechar</button><button className="primary-button" disabled={submitting} type="submit">{editing ? <Pencil size={16} /> : <ReceiptText size={16} />}{submitting ? 'Salvando' : editing ? 'Salvar alteracoes' : 'Registrar compra'}</button></footer>
            </form>
          </section>
        </div>
      )}

      {detailOpen && detailPurchase && (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="purchase-detail-title"
            aria-modal="true"
            className="modal-panel modal-extra-wide purchase-detail-modal"
            role="dialog"
          >
            <header className="modal-header">
              <span>
                <p className="eyebrow">Pedido de compra</p>
                <h2 id="purchase-detail-title">Pedido #{detailPurchase.displayNumber}</h2>
                <small className="purchase-technical-reference">Referencia original: {detailPurchase.number}</small>
              </span>
              <button
                className="icon-button"
                onClick={() => setDetailOpen(false)}
                title="Fechar"
                type="button"
              >
                <X size={18} />
              </button>
            </header>
            <div className="purchase-detail-content purchase-detail-with-fiscal">
              <div className="purchase-detail-summary">
                <span>
                  <small>Fornecedor</small>
                  <strong>{detailPurchase.supplierName}</strong>
                </span>
                <span>
                  <small>Etapa</small>
                  <strong>
                    {detailPurchase.status === 'CANCELLED'
                      ? 'Cancelada'
                      : workflowStageLabel(detailPurchase.workflowStage)}
                  </strong>
                </span>
                <span>
                  <small>Recebimento</small>
                  <strong>{detailFinancial?.received ? 'Integral' : 'Pendente ou parcial'}</strong>
                </span>
                <span>
                  <small>Notas vinculadas</small>
                  <strong>{detailPurchase.fiscalDocuments.length}</strong>
                </span>
                <span>
                  <small>Saldo financeiro</small>
                  <strong>{currency.format(detailFinancial?.balance ?? detailPurchase.total)}</strong>
                </span>
                <span>
                  <small>Valor inicial</small>
                  <strong>{currency.format(detailNegotiation?.initialValue ?? 0)}</strong>
                </span>
                <span>
                  <small>Valor negociado</small>
                  <strong>{currency.format(detailNegotiation?.negotiatedValue ?? 0)}</strong>
                </span>
                <span>
                  <small>Economia</small>
                  <strong>
                    {currency.format(detailNegotiation?.savings ?? 0)} |{' '}
                    {percentage.format(detailNegotiation?.savingsPercentage ?? 0)}%
                  </strong>
                </span>
                <span>
                  <small>Emissao</small>
                  <strong>{formatDate(detailPurchase.issuedAt)}</strong>
                </span>
                <span>
                  <small>Referencia fiscal da planilha</small>
                  <strong>{detailPurchase.invoiceNumber ?? 'Nao informada'}</strong>
                </span>
                <span>
                  <small>Documento fiscal</small>
                  <strong>
                    {detailPurchase.fiscalDocumentRequired ? 'Exigido' : 'Nao exigido'}
                  </strong>
                </span>
                <span>
                  <small>Categoria</small>
                  <strong>{detailPurchase.category ?? 'Nao informada'}</strong>
                </span>
              </div>

              <aside className="purchase-fiscal-sidebar" aria-label="Documentos fiscais vinculados">
                <header>
                  <span>
                    <small>Documentos fiscais</small>
                    <strong>NF-e vinculadas</strong>
                  </span>
                  <span className="fiscal-document-count">
                    {detailPurchase.fiscalDocuments.length}
                  </span>
                </header>
                {detailPurchase.fiscalDocuments.length ? (
                  <div className="purchase-fiscal-card-list">
                    {detailPurchase.fiscalDocuments.map((document) => (
                      <article className="purchase-fiscal-card" key={document.id ?? document.invoiceNumber}>
                        <header>
                          <span>
                            <small>Nota fiscal</small>
                            <strong>NF {document.invoiceNumber ?? 'Sem numero'}</strong>
                          </span>
                          {document.kind && <span className="fiscal-kind-badge">{document.kind}</span>}
                        </header>
                        <dl>
                          <div><dt>Emitente</dt><dd>{document.issuerName ?? detailPurchase.supplierName}</dd></div>
                          <div><dt>CNPJ</dt><dd>{formatTaxDocument(document.issuerDocument)}</dd></div>
                          <div><dt>Emissao</dt><dd>{formatFiscalDate(document.issuedAt)}</dd></div>
                          <div><dt>Valor</dt><dd>{document.total === null ? 'Nao lido' : currency.format(document.total)}</dd></div>
                          <div><dt>Vinculo</dt><dd>{fiscalMatchLabel(document.matchStatus)}</dd></div>
                        </dl>
                        {document.accessKey && (
                          <p className="fiscal-access-key" title={document.accessKey}>
                            Chave {document.accessKey}
                          </p>
                        )}
                        {document.id && document.fileAvailable && (
                          <button
                            className="secondary-button fiscal-file-button"
                            disabled={openingFiscalDocumentId === document.id}
                            onClick={() => void openFiscalDocument(document.id!)}
                            type="button"
                          >
                            <Download size={15} />
                            {openingFiscalDocumentId === document.id
                              ? 'Abrindo'
                              : document.kind === 'PDF'
                                ? 'Abrir DANFE'
                                : 'Abrir XML'}
                          </button>
                        )}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="purchase-fiscal-empty">
                    <FileCheck2 size={20} />
                    <strong>Nenhum documento validado</strong>
                    <p>O recebimento fiscal aguarda um arquivo legivel e conciliado.</p>
                  </div>
                )}
                {!detailPurchase.fiscalDocuments.length && detailPurchase.invoiceNumber && (
                  <div className="legacy-fiscal-reference">
                    <small>Referencia nao validada da planilha</small>
                    <strong>{detailPurchase.invoiceNumber}</strong>
                    <p>Este numero nao foi convertido em NF-e porque nao ha arquivo fiscal legivel.</p>
                  </div>
                )}
              </aside>

              <section className="purchase-detail-section">
                <header>
                  <strong>Itens e rateios</strong>
                  <span>{detailPurchase.items.length} itens</span>
                </header>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Descricao</th>
                        <th>Centro de custo</th>
                        <th className="align-right">Quantidade</th>
                        <th className="align-right">Preco original</th>
                        <th className="align-right">Preco negociado</th>
                        <th className="align-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailPurchase.items.map((item) => (
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
                          <td className="align-right">{currency.format(item.unitPrice)}</td>
                          <td className="align-right savings-cell">
                            {currency.format(item.negotiatedPrice ?? item.unitPrice)}
                          </td>
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
                  <strong>Recebimentos</strong>
                  <span>{goodsReceipts.length} conferencia(s)</span>
                </header>
                {goodsReceipts.length ? (
                  <div className="receipt-history-list">
                    {goodsReceipts.map((receipt) => (
                      <div className="receipt-history-row" key={receipt.id}>
                        <span>
                          <strong>{formatDate(receipt.receivedAt)}</strong>
                          <small>{receipt.confirmedByName}</small>
                        </span>
                        <span>
                          <strong>{receipt.items.length} item(ns)</strong>
                          <small>{receipt.notes ?? 'Sem observacao'}</small>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="detail-empty">Nenhum recebimento confirmado.</p>
                )}
                {canWrite && canConfirmPurchaseReceipt(detailPurchase) && (
                  <button className="secondary-button" onClick={() => void openReceipt(detailPurchase)} type="button">
                    <PackageCheck size={16} />Confirmar recebimento
                  </button>
                )}
              </section>

              <section className="purchase-detail-section">
                <header>
                  <strong>Parcelas e pagamento</strong>
                  <span>{detailPurchase.installments.length} parcelas</span>
                </header>
                {detailPurchase.installments.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Parcela</th>
                          <th>Vencimento</th>
                          <th>Canal</th>
                          <th>Referencia</th>
                          <th>Status</th>
                          <th className="align-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailPurchase.installments.map((installment) => (
                          <tr key={installment.sequence}>
                            <td>{installment.sequence}</td>
                            <td>{formatDate(installment.dueDate)}</td>
                            <td>{paymentChannelLabel(installment.paymentChannel)}</td>
                            <td>{installment.paymentReference ?? 'Nao informada'}</td>
                            <td>{installment.paidAt ? `Paga em ${formatDate(installment.paidAt)}` : 'Em aberto'}</td>
                            <td className="align-right amount-cell">
                              {currency.format(installment.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="detail-empty">Nenhuma parcela cadastrada.</p>
                )}
              </section>

              {detailPurchase.approval && (
                <section className="purchase-detail-section">
                  <header>
                    <strong>Aprovacao</strong>
                    <span>{approvalStatusLabel(detailPurchase.approval.status)}</span>
                  </header>
                  <div className="approval-participant-list">
                    {detailPurchase.approval.participants.map((participant) => (
                      <div key={participant.userId}>
                        <span>
                          <strong>{participant.name}</strong>
                          <small>
                            {participant.decidedAt
                              ? formatDateTime(participant.decidedAt)
                              : 'Aguardando decisao'}
                          </small>
                        </span>
                        <span className={`status-label ${participant.decision === 'APPROVED' ? 'active' : participant.decision === 'REJECTED' ? 'cancelled' : 'warning'}`}>
                          {approvalDecisionLabel(participant.decision)}
                        </span>
                        {participant.comment && <p>{participant.comment}</p>}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className="purchase-detail-section">
                <header>
                  <strong>Historico do fluxo</strong>
                  <span>{detailPurchase.stageHistory.length} registros</span>
                </header>
                <ol className="stage-history-list">
                  {[...detailPurchase.stageHistory].reverse().map((history) => (
                    <li key={history.id}>
                      <span className="stage-history-marker" />
                      <div>
                        <strong>
                          {history.fromStage
                            ? `${workflowStageLabel(history.fromStage)} para ${workflowStageLabel(history.toStage)}`
                            : workflowStageLabel(history.toStage)}
                        </strong>
                        <small>
                          {formatDateTime(history.createdAt)} | {history.changedByName}
                        </small>
                        {history.reason && <p>{history.reason}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              </section>

              {detailPurchase.notes && (
                <section className="purchase-detail-section">
                  <header>
                    <strong>Observacoes</strong>
                  </header>
                  <p className="purchase-detail-notes">{detailPurchase.notes}</p>
                </section>
              )}
            </div>
            {error && <div className="form-error">{error}</div>}
            <footer className="modal-actions">
              {canWrite && canEditPurchase(detailPurchase, canManageWorkflow) && (
                <button className="primary-button" onClick={editOpenPurchase} type="button">
                  <Pencil size={16} />Editar pedido
                </button>
              )}
              <button
                className="secondary-button"
                onClick={() => setDetailOpen(false)}
                type="button"
              >
                Fechar
              </button>
            </footer>
          </section>
        </div>
      )}

      {receiptOpen && receiptPurchase && (
        <div className="modal-backdrop" role="presentation">
          <section aria-labelledby="receipt-title" aria-modal="true" className="modal-panel modal-wide" role="dialog">
            <header className="modal-header">
              <span><p className="eyebrow">Conferencia fisica</p><h2 id="receipt-title">Receber pedido #{receiptPurchase.displayNumber}</h2></span>
              <button className="icon-button" onClick={() => { setReceiptOpen(false); setDetailOpen(true); }} title="Fechar" type="button"><X size={18} /></button>
            </header>
            <div className="management-form">
              <label>Data do recebimento<input onChange={(event) => setReceiptDate(event.target.value)} type="date" value={receiptDate} /></label>
              <div className="receipt-item-editor">
                <div className="receipt-item-header"><span>Item</span><span>Pedido</span><span>Ja recebido</span><span>Documento</span><span>Receber agora</span></div>
                {receiptPurchase.items.map((item) => {
                  const alreadyReceived = receivedQuantityByItem(goodsReceipts).get(item.id) ?? 0;
                  const remaining = Math.max(0, item.quantity - alreadyReceived);
                  const fiscalOptions = receiptFiscalItems.filter(
                    (fiscalItem) => fiscalItem.purchaseItemId === item.id,
                  );
                  const selectedFiscalItem = fiscalOptions.find(
                    (fiscalItem) => fiscalItem.id === receiptFiscalSelections[item.id],
                  );
                  const maximum = selectedFiscalItem
                    ? Math.min(remaining, selectedFiscalItem.remainingQuantity)
                    : fiscalOptions.length
                      ? 0
                      : remaining;
                  return (
                    <div className="receipt-item-row" key={item.id}>
                      <span><strong>{item.description}</strong><small>{item.unit ?? 'Unidade nao informada'}</small></span>
                      <span>{item.quantity}</span>
                      <span>{alreadyReceived}</span>
                      {fiscalOptions.length ? (
                        <label>
                          <span className="sr-only">NF-e de {item.description}</span>
                          <select
                            disabled={remaining <= 0}
                            onChange={(event) => {
                              const selectedId = event.target.value;
                              const selected = fiscalOptions.find(
                                (fiscalItem) => fiscalItem.id === selectedId,
                              );
                              setReceiptFiscalSelections((current) => ({
                                ...current,
                                [item.id]: selectedId,
                              }));
                              setReceiptQuantities((current) => ({
                                ...current,
                                [item.id]: selected
                                  ? editableNumber(
                                      Math.min(remaining, selected.remainingQuantity),
                                    )
                                  : '',
                              }));
                            }}
                            value={receiptFiscalSelections[item.id] ?? ''}
                          >
                            <option value="">Selecione</option>
                            {fiscalOptions.map((fiscalItem) => (
                              <option
                                disabled={fiscalItem.remainingQuantity <= 0.0001}
                                key={fiscalItem.id}
                                value={fiscalItem.id}
                              >
                                NF {fiscalItem.invoiceNumber ?? 'sem numero'} | saldo {fiscalItem.remainingQuantity}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <small className="receipt-fiscal-empty">
                          {receiptPurchase.fiscalDocumentRequired
                            ? 'Sem linha fiscal'
                            : 'Nao exigido'}
                        </small>
                      )}
                      <label><span className="sr-only">Quantidade recebida de {item.description}</span><input disabled={remaining <= 0 || maximum <= 0} max={maximum} min="0" onChange={(event) => setReceiptQuantities((current) => ({ ...current, [item.id]: event.target.value }))} step="0.0001" type="number" value={receiptQuantities[item.id] ?? ''} /></label>
                    </div>
                  );
                })}
              </div>
              <label>Observacoes<textarea maxLength={1000} onChange={(event) => setReceiptNotes(event.target.value)} rows={3} value={receiptNotes} /></label>
            </div>
            {error && <div className="form-error">{error}</div>}
            <footer className="modal-actions"><button className="secondary-button" onClick={() => { setReceiptOpen(false); setDetailOpen(true); }} type="button">Voltar</button><button className="primary-button" disabled={submitting || !receiptDate} onClick={() => void saveReceipt()} type="button"><PackageCheck size={16} />{submitting ? 'Confirmando' : 'Confirmar recebimento'}</button></footer>
          </section>
        </div>
      )}

      {lifecycleOpen && lifecyclePurchase && (
        <div className="modal-backdrop" role="presentation">
          <section aria-labelledby="purchase-lifecycle-title" aria-modal="true" className="modal-panel" role="dialog">
            <header className="modal-header">
              <span><p className="eyebrow">Ciclo da compra</p><h2 id="purchase-lifecycle-title">{lifecyclePurchase.status === 'CANCELLED' ? 'Reativar compra' : 'Cancelar compra'}</h2></span>
              <button className="icon-button" onClick={() => setLifecycleOpen(false)} title="Fechar" type="button"><X size={18} /></button>
            </header>
            <div className="management-form">
              <div className="lifecycle-purchase-summary"><span><small>Pedido</small><strong>#{lifecyclePurchase.displayNumber}</strong></span><span><small>Fornecedor</small><strong>{lifecyclePurchase.supplierName}</strong></span><span><small>Valor</small><strong>{currency.format(lifecyclePurchase.total)}</strong></span></div>
              <label>Motivo<textarea autoFocus maxLength={500} minLength={3} onChange={(event) => setLifecycleReason(event.target.value)} required rows={4} value={lifecycleReason} /></label>
              {error && <div className="form-error">{error}</div>}
              <footer className="modal-actions">
                <button className="secondary-button" onClick={() => setLifecycleOpen(false)} type="button">Fechar</button>
                <button className={lifecyclePurchase.status === 'CANCELLED' ? 'primary-button' : 'danger-button'} disabled={submitting || lifecycleReason.trim().length < 3} onClick={() => void changeLifecycle()} type="button">{lifecyclePurchase.status === 'CANCELLED' ? <RotateCcw size={16} /> : <CircleX size={16} />}{submitting ? 'Salvando' : lifecyclePurchase.status === 'CANCELLED' ? 'Reativar compra' : 'Cancelar compra'}</button>
              </footer>
            </div>
          </section>
        </div>
      )}

      {moving && (
        <div className="modal-backdrop" role="presentation">
          <section aria-labelledby="move-purchase-title" aria-modal="true" className="modal-panel" role="dialog">
            <header className="modal-header">
              <span><p className="eyebrow">Retorno de etapa</p><h2 id="move-purchase-title">Pedido #{moving.purchase.displayNumber}</h2></span>
              <button className="icon-button" onClick={() => setMoving(null)} title="Fechar" type="button"><X size={18} /></button>
            </header>
            <div className="management-form">
              <p>O pedido retornara para {workflowStageLabel(moving.target)}.</p>
              <label>Motivo<textarea autoFocus maxLength={500} minLength={3} onChange={(event) => setMoveReason(event.target.value)} required rows={4} value={moveReason} /></label>
              {error && <div className="form-error">{error}</div>}
              <footer className="modal-actions">
                <button className="secondary-button" onClick={() => setMoving(null)} type="button">Fechar</button>
                <button className="primary-button" disabled={pendingId === moving.purchase.id || moveReason.trim().length < 3} onClick={() => void movePurchase(moving.purchase, moving.target, moveReason.trim())} type="button"><RotateCcw size={16} />Confirmar retorno</button>
              </footer>
            </div>
          </section>
        </div>
      )}

      <PurchaseAuditDialog
        accessToken={accessToken}
        onClose={() => setAuditOpen(false)}
        open={auditOpen}
        organizationId={organizationId}
      />
    </div>
  );
}

export function approvedByLabel(
  approvedBy: NonNullable<PurchaseSummary['approval']>['approvedBy'],
): string {
  return approvedBy.map((approval) => approval.name).join(' e ');
}

function newPurchaseForm(): PurchaseForm {
  return { category: '', fiscalDocumentRequired: true, invoiceNumber: '', issuedAt: new Date().toISOString().slice(0, 10), notes: '', number: '', operationNature: '', paymentMethod: '', supplierId: '' };
}

function newPurchaseItem(): PurchaseItemRow {
  return { allocations: [], costCenterId: '', description: '', id: crypto.randomUUID(), negotiatedPrice: '', quantity: '1', unit: 'UN', unitPrice: '' };
}

function equalize(rows: AllocationRow[]): AllocationRow[] {
  const percentage = Math.floor((100 / rows.length) * 100) / 100;
  let assigned = 0;
  return rows.map((row, index) => {
    const value = index === rows.length - 1 ? Math.round((100 - assigned) * 100) / 100 : percentage;
    assigned += value;
    return { ...row, percentage: String(value).replace('.', ',') };
  });
}

function toCreatePurchaseInput(
  form: PurchaseForm,
  items: PurchaseItemRow[],
  installments: InstallmentRow[],
): CreatePurchaseInput {
  const input = toEditablePurchaseInput(form, items, installments);
  if (!input.issuedAt) throw new Error('Informe a data de emissao.');
  return {
    ...input,
    issuedAt: input.issuedAt,
    source: 'MANUAL',
    sourceReference: null,
  };
}

function toUpdatePurchaseInput(
  form: PurchaseForm,
  items: PurchaseItemRow[],
  installments: InstallmentRow[],
  expectedUpdatedAt: string,
): UpdatePurchaseInput {
  return { ...toEditablePurchaseInput(form, items, installments), expectedUpdatedAt };
}

function toEditablePurchaseInput(
  form: PurchaseForm,
  items: PurchaseItemRow[],
  installments: InstallmentRow[],
): Omit<UpdatePurchaseInput, 'expectedUpdatedAt'> {
  if (!form.supplierId) throw new Error('Selecione o fornecedor.');
  const parsedItems = items.map((item) => {
    const quantity = parseDecimal(item.quantity || '1');
    const unitPrice = parseMoney(item.unitPrice);
    const negotiatedPrice = item.negotiatedPrice.trim() ? parseMoney(item.negotiatedPrice) : null;
    if (!item.description.trim()) throw new Error('Todos os itens precisam de descricao.');
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error(`Quantidade invalida para ${item.description}.`);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) throw new Error(`Preco original invalido para ${item.description}.`);
    if (negotiatedPrice !== null && (!Number.isFinite(negotiatedPrice) || negotiatedPrice < 0)) throw new Error(`Preco negociado invalido para ${item.description}.`);
    return {
      description: item.description.trim(),
      quantity,
      unit: item.unit.trim() || null,
      unitPrice,
      negotiatedPrice,
      costCenterId: item.allocations.length ? null : item.costCenterId || null,
      allocations: item.allocations.map((allocation) => ({ costCenterId: allocation.costCenterId, percentage: parseDecimal(allocation.percentage) })),
    };
  });
  return {
    number: form.number.trim(),
    invoiceNumber: form.invoiceNumber.trim() || null,
    fiscalDocumentRequired: form.fiscalDocumentRequired,
    supplierId: form.supplierId,
    issuedAt: form.issuedAt || null,
    category: form.category.trim() || null,
    operationNature: form.operationNature.trim() || null,
    paymentMethod: form.paymentMethod.trim() || null,
    notes: form.notes.trim() || null,
    items: parsedItems,
    installments: installments.map((installment) => ({
      dueDate: installment.dueDate,
      amount: parseMoney(installment.amount),
      paymentChannel: installment.paymentChannel || null,
      paymentReference: installment.paymentReference.trim() || null,
      paymentNotes: installment.paymentNotes.trim() || null,
    })),
  };
}

export function purchaseDetailToEditor(detail: PurchaseDetail): {
  form: PurchaseForm;
  installments: InstallmentRow[];
  items: PurchaseItemRow[];
} {
  return {
    form: {
      category: detail.category ?? '',
      fiscalDocumentRequired: detail.fiscalDocumentRequired,
      invoiceNumber: detail.invoiceNumber ?? '',
      issuedAt: detail.issuedAt ?? '',
      notes: detail.notes ?? '',
      number: detail.number,
      operationNature: detail.operationNature ?? '',
      paymentMethod: detail.paymentMethod ?? '',
      supplierId: detail.supplierId,
    },
    items: detail.items.map((item) => ({
      allocations: item.allocations.map((allocation, index) => ({
        costCenterId: allocation.costCenterId,
        id: `${item.id}-allocation-${index}`,
        percentage: editableNumber(allocation.percentage),
      })),
      costCenterId: item.costCenterId ?? '',
      description: item.description,
      id: item.id,
      negotiatedPrice:
        item.negotiatedPrice === null ? '' : editableNumber(item.negotiatedPrice),
      quantity: editableNumber(item.quantity),
      unit: item.unit ?? '',
      unitPrice: editableNumber(item.unitPrice),
    })),
    installments: detail.installments.map((installment) => ({
      amount: editableNumber(installment.amount),
      dueDate: installment.dueDate,
      id: `${detail.id}-installment-${installment.sequence}`,
      paidAt: installment.paidAt,
      paymentChannel: installment.paymentChannel ?? '',
      paymentReference: installment.paymentReference ?? '',
      paymentNotes: installment.paymentNotes ?? '',
    })),
  };
}

function editableNumber(value: number): string {
  return String(value).replace('.', ',');
}

function replacePurchase(current: PurchaseSummary[], updated: PurchaseSummary): PurchaseSummary[] {
  return current.map((purchase) => (purchase.id === updated.id ? updated : purchase));
}

function approvalStatusLabel(
  status: NonNullable<PurchaseDetail['approval']>['status'],
): string {
  return {
    PENDING: 'Aguardando aprovacao',
    APPROVED: 'Aprovada',
    REJECTED: 'Reprovada',
    CANCELLED: 'Cancelada',
  }[status];
}

const purchaseDoubleClickInteractiveSelector =
  'button, a, input, select, textarea, [role="button"]';

export function shouldOpenPurchaseOnDoubleClick(target: EventTarget | null): boolean {
  const candidate = target as
    | (EventTarget & { closest?: (selector: string) => unknown })
    | null;
  return !candidate?.closest?.(purchaseDoubleClickInteractiveSelector);
}

export function purchaseNegotiationMetrics(total: number, savings: number) {
  const negotiatedValue = Math.max(0, total);
  const normalizedSavings = Math.max(0, savings);
  const initialValue = negotiatedValue + normalizedSavings;
  return {
    initialValue,
    negotiatedValue,
    savings: normalizedSavings,
    savingsPercentage:
      initialValue > 0 ? (normalizedSavings / initialValue) * 100 : 0,
  };
}

function canConfirmPurchaseReceipt(purchase: PurchaseSummary): boolean {
  return purchase.fiscalDocumentRequired
    ? ['SUPPLIER_INVOICED', 'RECEIVED'].includes(purchase.workflowStage)
    : ['PURCHASE_ORDER', 'RECEIVED'].includes(purchase.workflowStage);
}

function approvalDecisionLabel(
  decision: NonNullable<PurchaseDetail['approval']>['participants'][number]['decision'],
): string {
  return {
    PENDING: 'Pendente',
    APPROVED: 'Aprovada',
    REJECTED: 'Reprovada',
  }[decision];
}

function paymentChannelLabel(
  channel: PurchaseDetail['installments'][number]['paymentChannel'],
): string {
  if (!channel) return 'Automatico do fornecedor';
  return {
    PIX: 'Pix',
    CARD_LINK: 'Link de cartao',
    BOLETO: 'Boleto',
    BANK_TRANSFER: 'Transferencia',
    OTHER: 'Outro',
  }[channel];
}

const workflowStages: PurchaseWorkflowStage[] = [
  'REGISTRATION',
  'REQUESTED',
  'AWAITING_APPROVAL',
  'PURCHASE_ORDER',
  'SUPPLIER_INVOICED',
  'RECEIVED',
  'COMPLETED',
];

function workflowStageIndex(stage: PurchaseWorkflowStage): number {
  return workflowStages.indexOf(stage);
}

function workflowStageLabel(stage: PurchaseWorkflowStage): string {
  return {
    REGISTRATION: 'Registro',
    REQUESTED: 'Solicitacao',
    AWAITING_APPROVAL: 'Aguardando aprovacao',
    PURCHASE_ORDER: 'Pedido de compra',
    SUPPLIER_INVOICED: 'Faturado pelo fornecedor',
    RECEIVED: 'Recebido',
    COMPLETED: 'Concluido',
  }[stage];
}

function previousWorkflowStage(
  stage: PurchaseWorkflowStage,
): PurchaseWorkflowStage | null {
  return {
    REGISTRATION: null,
    REQUESTED: 'REGISTRATION',
    AWAITING_APPROVAL: 'REQUESTED',
    PURCHASE_ORDER: 'REQUESTED',
    SUPPLIER_INVOICED: 'PURCHASE_ORDER',
    RECEIVED: 'SUPPLIER_INVOICED',
    COMPLETED: 'RECEIVED',
  }[stage] as PurchaseWorkflowStage | null;
}

function nextWorkflowStage(
  stage: PurchaseWorkflowStage,
): PurchaseWorkflowStage | null {
  return {
    REGISTRATION: 'REQUESTED',
    REQUESTED: 'AWAITING_APPROVAL',
    AWAITING_APPROVAL: null,
    PURCHASE_ORDER: null,
    SUPPLIER_INVOICED: null,
    RECEIVED: null,
    COMPLETED: null,
  }[stage] as PurchaseWorkflowStage | null;
}

function canMoveTo(
  purchase: PurchaseSummary,
  to: PurchaseWorkflowStage,
  canManageWorkflow: boolean,
): boolean {
  const from = purchase.workflowStage;
  if (from === to || purchase.status === 'CANCELLED') return false;
  if (nextWorkflowStage(from) === to) return true;
  if (workflowStageIndex(to) >= workflowStageIndex(from)) return false;
  if (!canManageWorkflow && previousWorkflowStage(from) !== to) return false;
  if (
    purchase.invoiceLinked &&
    workflowStageIndex(to) < workflowStageIndex('PURCHASE_ORDER')
  ) {
    return false;
  }
  return true;
}

function canEditPurchase(
  purchase: PurchaseSummary,
  canManageWorkflow: boolean,
): boolean {
  return (
    purchase.status !== 'CANCELLED' &&
    (canManageWorkflow ||
      purchase.workflowStage === 'REGISTRATION' ||
      purchase.workflowStage === 'REQUESTED')
  );
}

function calculateTotals(items: PurchaseItemRow[]) {
  return items.reduce((result, item) => {
    const quantity = validOrZero(parseDecimal(item.quantity));
    const original = validOrZero(parseMoney(item.unitPrice));
    const negotiated = item.negotiatedPrice.trim() ? validOrZero(parseMoney(item.negotiatedPrice)) : original;
    result.total += quantity * negotiated;
    result.savings += quantity * Math.max(0, original - negotiated);
    return result;
  }, { savings: 0, total: 0 });
}

function parseMoney(value: string): number {
  const compact = value.replace(/R\$|\s/g, '');
  return Number(compact.includes(',') ? compact.replace(/\./g, '').replace(',', '.') : compact);
}

function parseDecimal(value: string): number {
  return Number(value.trim().replace(',', '.'));
}

function validOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function formatDate(value: string | null): string {
  if (!value) return 'Sem data';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatFiscalDate(value: string | null): string {
  if (!value) return 'Nao informada';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(value));
}

function formatTaxDocument(value: string | null): string {
  if (!value) return 'Nao informado';
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 14) return value;
  return digits.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    '$1.$2.$3/$4-$5',
  );
}

function fiscalMatchLabel(
  status: PurchaseDetail['fiscalDocuments'][number]['matchStatus'],
): string {
  if (!status) return 'Aguardando validacao';
  return {
    UNMATCHED: 'Nao vinculada',
    MATCHED_EXACT: 'Correspondencia exata',
    MATCHED_MANUAL: 'Revisada manualmente',
    REVIEW_REQUIRED: 'Revisao necessaria',
    REJECTED: 'Rejeitada',
  }[status];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Nao foi possivel registrar a compra.';
}

function receivedQuantityByItem(receipts: GoodsReceipt[]): Map<string, number> {
  const totals = new Map<string, number>();
  receipts
    .filter((receipt) => receipt.status === 'CONFIRMED')
    .flatMap((receipt) => receipt.items)
    .forEach((item) => {
      totals.set(item.purchaseItemId, (totals.get(item.purchaseItemId) ?? 0) + item.quantity);
    });
  return totals;
}

function summarizePayables(
  payables: PayableKanbanCard[],
): Map<string, { balance: number; invoiceCount: number; received: boolean }> {
  const grouped = new Map<
    string,
    { balance: number; invoiceNumbers: Set<string>; received: boolean }
  >();
  payables.forEach((payable) => {
    const current = grouped.get(payable.purchaseId) ?? {
      balance: 0,
      invoiceNumbers: new Set<string>(),
      received: true,
    };
    current.balance += payable.balance;
    current.received = current.received && payable.received;
    payable.invoiceNumbers.forEach((number) => current.invoiceNumbers.add(number));
    grouped.set(payable.purchaseId, current);
  });
  return new Map(
    [...grouped].map(([purchaseId, value]) => [
      purchaseId,
      {
        balance: value.balance,
        invoiceCount: value.invoiceNumbers.size,
        received: value.received,
      },
    ]),
  );
}
