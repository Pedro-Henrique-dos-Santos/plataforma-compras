import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type {
  CostCenter,
  CreatePurchaseInput,
  PurchaseSummary,
  Supplier,
} from '@compras/contracts';
import {
  CalendarPlus,
  GitBranch,
  Plus,
  ReceiptText,
  Search,
  Trash2,
  X,
} from 'lucide-react';

import { apiGet, apiPost } from '../lib/api';

type PurchasesViewProps = {
  accessToken: string | null;
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
type InstallmentRow = { amount: string; dueDate: string; id: string };
type PurchaseForm = {
  category: string;
  issuedAt: string;
  notes: string;
  number: string;
  operationNature: string;
  paymentMethod: string;
  supplierId: string;
};

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function PurchasesView({
  accessToken,
  canWrite,
  onChanged,
  organizationId,
}: PurchasesViewProps) {
  const [purchases, setPurchases] = useState<PurchaseSummary[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<PurchaseForm>(newPurchaseForm());
  const [items, setItems] = useState<PurchaseItemRow[]>([newPurchaseItem()]);
  const [installments, setInstallments] = useState<InstallmentRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void Promise.all([
      apiGet<PurchaseSummary[]>('/purchases', { token: accessToken, organizationId, signal: controller.signal }),
      apiGet<Supplier[]>('/suppliers?status=ACTIVE', { token: accessToken, organizationId, signal: controller.signal }),
      apiGet<CostCenter[]>('/cost-centers', { token: accessToken, organizationId, signal: controller.signal }),
    ])
      .then(([purchaseRows, supplierRows, centerRows]) => {
        setPurchases(purchaseRows);
        setSuppliers(supplierRows);
        setCostCenters(centerRows);
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
      const content = `${purchase.number} ${purchase.supplierName} ${purchase.category ?? ''} ${purchase.departments.join(' ')}`;
      return !term || normalize(content).includes(term);
    });
  }, [purchases, search]);

  const selectedSupplier = suppliers.find((supplier) => supplier.id === form.supplierId) ?? null;
  const totals = useMemo(() => calculateTotals(items), [items]);

  function openCreate() {
    setForm({ ...newPurchaseForm(), supplierId: suppliers[0]?.id ?? '' });
    setItems([newPurchaseItem()]);
    setInstallments([]);
    setError(null);
    setDialogOpen(true);
  }

  function formField<K extends keyof PurchaseForm>(key: K, value: PurchaseForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function itemField(id: string, field: keyof Omit<PurchaseItemRow, 'id' | 'allocations'>, value: string) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item));
  }

  function enableAllocations(id: string) {
    setItems((current) => current.map((item) => item.id === id ? {
      ...item,
      costCenterId: '',
      allocations: [{ id: crypto.randomUUID(), costCenterId: costCenters[0]?.id ?? '', percentage: '100' }],
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
    setInstallments((current) => [...current, { amount: '', dueDate: form.issuedAt, id: crypto.randomUUID() }]);
  }

  function updateInstallment(id: string, field: 'amount' | 'dueDate', value: string) {
    setInstallments((current) => current.map((installment) => installment.id === id ? { ...installment, [field]: value } : installment));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const input = toPurchaseInput(form, items, installments);
      const created = await apiPost<PurchaseSummary>('/purchases', input, {
        token: accessToken,
        organizationId,
      });
      setPurchases((current) => [created, ...current]);
      setDialogOpen(false);
      setRevision((current) => current + 1);
      onChanged();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="management-layout">
      <section className="section-heading">
        <span><p className="eyebrow">Operacao de compras</p><h2>Lancamentos registrados</h2></span>
        {canWrite && <button className="primary-button" onClick={openCreate} type="button"><Plus size={16} />Nova compra</button>}
      </section>

      <section className="filter-bar panel">
        <label className="search-field"><Search size={16} /><span className="sr-only">Buscar compra</span><input onChange={(event) => setSearch(event.target.value)} placeholder="Pedido, fornecedor, categoria ou departamento" value={search} /></label>
        <span className="count-label">{visiblePurchases.length} compras</span>
      </section>

      {error && !dialogOpen && <div className="inline-error">{error}</div>}

      <section className="panel table-panel">
        {loading ? <div className="table-loading">Carregando compras</div> : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Pedido</th><th>Fornecedor</th><th>Departamentos</th><th>Itens</th><th>Data</th><th className="align-right">Economia</th><th className="align-right">Total</th></tr></thead>
              <tbody>
                {visiblePurchases.length ? visiblePurchases.map((purchase) => (
                  <tr key={purchase.id}>
                    <td className="order-id">{purchase.number}</td>
                    <td>{purchase.supplierName}</td>
                    <td>{purchase.departments.join(', ') || 'Nao classificado'}</td>
                    <td>{purchase.itemCount}</td>
                    <td>{formatDate(purchase.issuedAt)}</td>
                    <td className="align-right savings-cell">{currency.format(purchase.negotiatedSavings)}</td>
                    <td className="align-right amount-cell">{currency.format(purchase.total)}</td>
                  </tr>
                )) : <tr><td className="empty-table-cell" colSpan={7}>Nenhuma compra encontrada</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {dialogOpen && (
        <div className="modal-backdrop" role="presentation">
          <section aria-labelledby="purchase-title" aria-modal="true" className="modal-panel modal-extra-wide purchase-modal" role="dialog">
            <header className="modal-header">
              <span><p className="eyebrow">Novo lancamento</p><h2 id="purchase-title">Registrar compra</h2></span>
              <button className="icon-button" onClick={() => setDialogOpen(false)} title="Fechar" type="button"><X size={18} /></button>
            </header>
            <form className="management-form purchase-form" onSubmit={(event) => void submit(event)}>
              <div className="form-grid three-columns">
                <label>Numero do pedido<input autoFocus maxLength={40} onChange={(event) => formField('number', event.target.value)} required value={form.number} /></label>
                <label>Data de emissao<input onChange={(event) => formField('issuedAt', event.target.value)} required type="date" value={form.issuedAt} /></label>
                <label>Fornecedor<select onChange={(event) => formField('supplierId', event.target.value)} required value={form.supplierId}><option value="">Selecione</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.tradeName ?? supplier.legalName}</option>)}</select></label>
                <label>Categoria<input maxLength={100} onChange={(event) => formField('category', event.target.value)} placeholder={selectedSupplier?.category ?? 'Automatica pelo fornecedor'} value={form.category} /></label>
                <label>Natureza da operacao<input maxLength={100} onChange={(event) => formField('operationNature', event.target.value)} placeholder={selectedSupplier?.operationNature ?? 'Automatica pelo fornecedor'} value={form.operationNature} /></label>
                <label>Metodo de pagamento<input maxLength={80} onChange={(event) => formField('paymentMethod', event.target.value)} placeholder={selectedSupplier?.paymentMethod ?? 'Nao informado'} value={form.paymentMethod} /></label>
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
                          <label>Centro de custo<select onChange={(event) => itemField(item.id, 'costCenterId', event.target.value)} value={item.costCenterId}><option value="">Automatico do fornecedor</option>{costCenters.map((center) => <option key={center.id} value={center.id}>{center.code} | {center.name}</option>)}</select></label>
                        )}
                      </div>
                      {!item.allocations.length && <button className="text-button allocation-trigger" disabled={!costCenters.length} onClick={() => enableAllocations(item.id)} type="button"><GitBranch size={15} />Ratear entre departamentos</button>}
                      {item.allocations.length > 0 && (
                        <div className="allocation-editor">
                          {item.allocations.map((allocation) => (
                            <div className="allocation-row" key={allocation.id}>
                              <label>Departamento<select onChange={(event) => updateAllocation(item.id, allocation.id, 'costCenterId', event.target.value)} required value={allocation.costCenterId}><option value="">Selecione</option>{costCenters.map((center) => <option key={center.id} value={center.id}>{center.code} | {center.name}</option>)}</select></label>
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
                {installments.length > 0 && <div className="installment-list">{installments.map((installment, index) => <div className="installment-row" key={installment.id}><span>{index + 1}</span><label>Vencimento<input onChange={(event) => updateInstallment(installment.id, 'dueDate', event.target.value)} required type="date" value={installment.dueDate} /></label><label>Valor<input inputMode="decimal" onChange={(event) => updateInstallment(installment.id, 'amount', event.target.value)} placeholder="0,00" required value={installment.amount} /></label><button aria-label="Remover parcela" className="icon-button table-action" onClick={() => setInstallments((current) => current.filter((candidate) => candidate.id !== installment.id))} title="Remover parcela" type="button"><Trash2 size={15} /></button></div>)}</div>}
              </section>

              <label>Observacoes<textarea maxLength={2000} onChange={(event) => formField('notes', event.target.value)} rows={3} value={form.notes} /></label>

              <div className="purchase-total-band"><span><small>Total da compra</small><strong>{currency.format(totals.total)}</strong></span><span><small>Economia negociada</small><strong>{currency.format(totals.savings)}</strong></span></div>
              {error && <div className="form-error">{error}</div>}
              <footer className="modal-actions"><button className="secondary-button" onClick={() => setDialogOpen(false)} type="button">Cancelar</button><button className="primary-button" disabled={submitting} type="submit"><ReceiptText size={16} />{submitting ? 'Registrando' : 'Registrar compra'}</button></footer>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function newPurchaseForm(): PurchaseForm {
  return { category: '', issuedAt: new Date().toISOString().slice(0, 10), notes: '', number: '', operationNature: '', paymentMethod: '', supplierId: '' };
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

function toPurchaseInput(form: PurchaseForm, items: PurchaseItemRow[], installments: InstallmentRow[]): CreatePurchaseInput {
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
    supplierId: form.supplierId,
    issuedAt: form.issuedAt,
    category: form.category.trim() || null,
    operationNature: form.operationNature.trim() || null,
    paymentMethod: form.paymentMethod.trim() || null,
    notes: form.notes.trim() || null,
    source: 'MANUAL',
    sourceReference: null,
    items: parsedItems,
    installments: installments.map((installment) => ({ dueDate: installment.dueDate, amount: parseMoney(installment.amount) })),
  };
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Nao foi possivel registrar a compra.';
}
