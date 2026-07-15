import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import type {
  CostCenter,
  InvoiceDocumentDetail,
  InvoiceDocumentStatus,
  InvoiceDocumentSummary,
  InvoiceImportResult,
  InvoiceReviewInput,
  Supplier,
} from '@compras/contracts';
import {
  Ban,
  CheckCircle2,
  FileScan,
  FileText,
  Plus,
  RefreshCw,
  Save,
  SendToBack,
  Trash2,
  Upload,
} from 'lucide-react';

import { apiGet, apiPatch, apiPost, apiUpload } from '../lib/api';

type InvoiceDocumentsViewProps = {
  accessToken: string | null;
  canWrite: boolean;
  onChanged: () => void;
  organizationId: string;
};

type ItemForm = {
  costCenterId: string;
  description: string;
  negotiatedPrice: string;
  quantity: string;
  unit: string;
  unitPrice: string;
};

type InstallmentForm = {
  amount: string;
  dueDate: string;
};

type ReviewForm = {
  accessKey: string;
  category: string;
  defaultCostCenterId: string;
  installments: InstallmentForm[];
  invoiceNumber: string;
  issuedAt: string;
  items: ItemForm[];
  notes: string;
  operationNature: string;
  paymentMethod: string;
  supplierDocument: string;
  supplierId: string;
  supplierName: string;
  total: string;
};

const emptyForm: ReviewForm = {
  accessKey: '',
  category: '',
  defaultCostCenterId: '',
  installments: [],
  invoiceNumber: '',
  issuedAt: '',
  items: [],
  notes: '',
  operationNature: '',
  paymentMethod: '',
  supplierDocument: '',
  supplierId: '',
  supplierName: '',
  total: '',
};

const currency = new Intl.NumberFormat('pt-BR', {
  currency: 'BRL',
  style: 'currency',
});

const statusOptions: Array<{ label: string; value: InvoiceDocumentStatus | 'ALL' }> = [
  { label: 'Todos', value: 'ALL' },
  { label: 'Conferir', value: 'REVIEW_REQUIRED' },
  { label: 'Prontos', value: 'READY' },
  { label: 'Importados', value: 'IMPORTED' },
  { label: 'Fora do escopo', value: 'OUT_OF_SCOPE' },
  { label: 'Falhas', value: 'FAILED' },
];

export function InvoiceDocumentsView({
  accessToken,
  canWrite,
  onChanged,
  organizationId,
}: InvoiceDocumentsViewProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<InvoiceDocumentSummary[]>([]);
  const [selected, setSelected] = useState<InvoiceDocumentDetail | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [centers, setCenters] = useState<CostCenter[]>([]);
  const [form, setForm] = useState<ReviewForm>(emptyForm);
  const [file, setFile] = useState<File | null>(null);
  const [statusFilter, setStatusFilter] = useState<InvoiceDocumentStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void Promise.all([
      apiGet<InvoiceDocumentSummary[]>('/invoice-documents', {
        token: accessToken,
        organizationId,
        signal: controller.signal,
      }),
      apiGet<Supplier[]>('/suppliers?status=ACTIVE', {
        token: accessToken,
        organizationId,
        signal: controller.signal,
      }),
      apiGet<CostCenter[]>('/cost-centers', {
        token: accessToken,
        organizationId,
        signal: controller.signal,
      }),
    ])
      .then(([nextDocuments, nextSuppliers, nextCenters]) => {
        setDocuments(nextDocuments);
        setSuppliers(nextSuppliers);
        setCenters(nextCenters);
        setSelected(null);
        setForm(emptyForm);
        if (nextDocuments[0]) void selectDocument(nextDocuments[0].id);
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [accessToken, organizationId]);

  const visibleDocuments = useMemo(() => {
    const term = normalize(search);
    return documents.filter((document) => {
      if (statusFilter !== 'ALL' && document.status !== statusFilter) return false;
      if (!term) return true;
      return normalize(
        `${document.fileName} ${document.invoiceNumber ?? ''} ${document.supplierName ?? ''}`,
      ).includes(term);
    });
  }, [documents, search, statusFilter]);

  const calculatedTotal = useMemo(
    () =>
      form.items.reduce(
        (sum, item) =>
          sum +
          numberValue(item.quantity) *
            numberValue(item.negotiatedPrice || item.unitPrice),
        0,
      ),
    [form.items],
  );

  async function selectDocument(id: string) {
    setDetailLoading(true);
    setError(null);
    setSuccess(null);
    setRejecting(false);
    try {
      const detail = await apiGet<InvoiceDocumentDetail>(`/invoice-documents/${id}`, {
        token: accessToken,
        organizationId,
      });
      setSelected(detail);
      setForm(formFromDocument(detail, suppliers));
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setDetailLoading(false);
    }
  }

  async function uploadDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) {
      setError('Selecione um arquivo PDF ou XML.');
      return;
    }
    setBusy('upload');
    setError(null);
    setSuccess(null);
    try {
      const detail = await apiUpload<InvoiceDocumentDetail>(
        '/invoice-documents/upload',
        file,
        { token: accessToken, organizationId },
      );
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      setSelected(detail);
      setForm(formFromDocument(detail, suppliers));
      upsertDocument(detail);
      setSuccess(
        detail.status === 'FAILED'
          ? 'Arquivo armazenado, mas a leitura precisa ser reprocessada.'
          : 'Documento processado e enviado para conferencia.',
      );
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(null);
    }
  }

  async function saveReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setBusy('review');
    setError(null);
    setSuccess(null);
    try {
      const detail = await apiPatch<InvoiceDocumentDetail>(
        `/invoice-documents/${selected.id}/review`,
        toReviewInput(form),
        { token: accessToken, organizationId },
      );
      setSelected(detail);
      setForm(formFromDocument(detail, suppliers));
      upsertDocument(detail);
      setSuccess('Conferencia salva. A nota esta pronta para importacao.');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(null);
    }
  }

  async function importDocument() {
    if (!selected) return;
    setBusy('import');
    setError(null);
    setSuccess(null);
    try {
      const result = await apiPost<InvoiceImportResult>(
        `/invoice-documents/${selected.id}/import`,
        {},
        { token: accessToken, organizationId },
      );
      const nextSuppliers = await apiGet<Supplier[]>('/suppliers?status=ACTIVE', {
        token: accessToken,
        organizationId,
      });
      setSuppliers(nextSuppliers);
      setSelected(result.document);
      setForm(formFromDocument(result.document, nextSuppliers));
      upsertDocument(result.document);
      onChanged();
      setSuccess(importMessage(result));
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(null);
    }
  }

  async function reprocessDocument() {
    if (!selected) return;
    setBusy('reprocess');
    setError(null);
    setSuccess(null);
    try {
      const detail = await apiPost<InvoiceDocumentDetail>(
        `/invoice-documents/${selected.id}/reprocess`,
        {},
        { token: accessToken, organizationId },
      );
      setSelected(detail);
      setForm(formFromDocument(detail, suppliers));
      upsertDocument(detail);
      setSuccess('Documento reprocessado.');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(null);
    }
  }

  async function rejectDocument() {
    if (!selected || rejectReason.trim().length < 3) {
      setError('Informe o motivo para retirar a nota do escopo.');
      return;
    }
    setBusy('reject');
    setError(null);
    setSuccess(null);
    try {
      const detail = await apiPost<InvoiceDocumentDetail>(
        `/invoice-documents/${selected.id}/reject`,
        { reason: rejectReason.trim() },
        { token: accessToken, organizationId },
      );
      setSelected(detail);
      upsertDocument(detail);
      setRejecting(false);
      setRejectReason('');
      setSuccess('Documento retirado do escopo de compras.');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(null);
    }
  }

  function chooseSupplier(supplierId: string) {
    const supplier = suppliers.find((candidate) => candidate.id === supplierId);
    setForm((current) => ({
      ...current,
      supplierId,
      ...(supplier
        ? {
            supplierName: supplier.legalName,
            supplierDocument: digitsOnly(supplier.document),
            defaultCostCenterId:
              current.defaultCostCenterId || supplier.defaultCostCenterId || '',
            category: current.category || supplier.category || '',
            operationNature:
              current.operationNature || supplier.operationNature || '',
            paymentMethod: current.paymentMethod || supplier.paymentMethod || '',
          }
        : {}),
    }));
  }

  function updateItem(index: number, field: keyof ItemForm, value: string) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }));
  }

  function removeItem(index: number) {
    setForm((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  function addItem() {
    setForm((current) => ({
      ...current,
      items: [
        ...current.items,
        {
          costCenterId: current.defaultCostCenterId,
          description: '',
          negotiatedPrice: '',
          quantity: '1',
          unit: '',
          unitPrice: '0',
        },
      ],
    }));
  }

  function updateInstallment(
    index: number,
    field: keyof InstallmentForm,
    value: string,
  ) {
    setForm((current) => ({
      ...current,
      installments: current.installments.map((installment, installmentIndex) =>
        installmentIndex === index ? { ...installment, [field]: value } : installment,
      ),
    }));
  }

  function upsertDocument(detail: InvoiceDocumentDetail) {
    setDocuments((current) => {
      const summary = summaryFromDetail(detail);
      const exists = current.some((document) => document.id === detail.id);
      return exists
        ? current.map((document) => (document.id === detail.id ? summary : document))
        : [summary, ...current];
    });
  }

  if (loading) {
    return <div className="skeleton view-loading" aria-label="Carregando notas fiscais" />;
  }

  return (
    <div className="management-layout invoice-documents-view">
      <section className="section-heading">
        <span>
          <p className="eyebrow">Automacao documental</p>
          <h2>Notas fiscais</h2>
        </span>
        <span className="heading-count">{documents.length} documentos</span>
      </section>

      {canWrite && (
        <form className="invoice-upload-band" onSubmit={uploadDocument}>
          <label className="invoice-file-picker">
            <FileScan size={22} />
            <span>
              <strong>{file?.name ?? 'Selecionar PDF ou XML'}</strong>
              <small>PDF ate 10 MB, XML ate 5 MB</small>
            </span>
            <input
              accept=".pdf,.xml,application/pdf,application/xml,text/xml"
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setFile(event.target.files?.[0] ?? null)
              }
              ref={fileInput}
              type="file"
            />
          </label>
          <button className="primary-button" disabled={!file || busy === 'upload'} type="submit">
            <Upload size={16} />
            {busy === 'upload' ? 'Processando' : 'Enviar nota'}
          </button>
        </form>
      )}

      {error && <div className="inline-error">{error}</div>}
      {success && (
        <div className="success-banner">
          <CheckCircle2 size={18} />
          <span>{success}</span>
        </div>
      )}

      <section className="invoice-toolbar">
        <label className="search-field invoice-search">
          <span className="sr-only">Buscar documento</span>
          <input
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar arquivo, fornecedor ou nota"
            value={search}
          />
        </label>
        <div className="segmented-control invoice-status-filter" role="group" aria-label="Status">
          {statusOptions.map((option) => (
            <button
              aria-pressed={statusFilter === option.value}
              className={statusFilter === option.value ? 'active' : ''}
              key={option.value}
              onClick={() => setStatusFilter(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </section>

      <div className="invoice-workspace-grid">
        <section className="invoice-document-list" aria-label="Documentos fiscais">
          {visibleDocuments.length ? (
            visibleDocuments.map((document) => (
              <button
                className={`invoice-document-row ${selected?.id === document.id ? 'active' : ''}`}
                key={document.id}
                onClick={() => void selectDocument(document.id)}
                type="button"
              >
                <FileText size={18} />
                <span className="invoice-document-copy">
                  <strong>{document.fileName}</strong>
                  <small>
                    {document.supplierName ?? 'Fornecedor nao identificado'}
                    {document.total !== null ? ` | ${currency.format(document.total)}` : ''}
                  </small>
                </span>
                <span className={`status-pill status-${document.status.toLowerCase()}`}>
                  {statusLabel(document.status)}
                </span>
              </button>
            ))
          ) : (
            <div className="empty-table-state">Nenhum documento neste filtro.</div>
          )}
        </section>

        <section className="invoice-review-panel">
          {detailLoading ? (
            <div className="skeleton view-loading" aria-label="Carregando documento" />
          ) : selected ? (
            <>
              <header className="invoice-review-header">
                <span>
                  <p className="eyebrow">{selected.kind} | {selected.parser ?? 'Aguardando leitura'}</p>
                  <h3>{selected.fileName}</h3>
                  <small>
                    {selected.confidence !== null
                      ? `Confianca ${Math.round(selected.confidence * 100)}%`
                      : 'Sem indice de confianca'}
                  </small>
                </span>
                <span className={`status-pill status-${selected.status.toLowerCase()}`}>
                  {statusLabel(selected.status)}
                </span>
              </header>

              {(selected.warnings.length > 0 || selected.extraction?.triageReason) && (
                <div className="document-warning-list">
                  {selected.extraction?.triageReason && <p>{selected.extraction.triageReason}</p>}
                  {selected.warnings.map((warning) => <p key={warning}>{warning}</p>)}
                </div>
              )}
              {selected.errors.length > 0 && (
                <div className="inline-error document-errors">
                  {selected.errors.map((item) => <p key={item}>{item}</p>)}
                </div>
              )}

              <form className="invoice-review-form" onSubmit={saveReview}>
                <fieldset disabled={!canWrite || selected.status === 'IMPORTED'}>
                  <legend>Identificacao</legend>
                  <div className="form-grid three-columns">
                    <label className="field span-two">
                      <span>Fornecedor cadastrado</span>
                      <select
                        aria-label="Fornecedor cadastrado"
                        onChange={(event) => chooseSupplier(event.target.value)}
                        value={form.supplierId}
                      >
                        <option value="">Localizar ou cadastrar pela nota</option>
                        {suppliers.map((supplier) => (
                          <option key={supplier.id} value={supplier.id}>
                            {supplier.legalName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Centro de custo padrao</span>
                      <select
                        aria-label="Centro de custo padrao"
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            defaultCostCenterId: event.target.value,
                          }))
                        }
                        value={form.defaultCostCenterId}
                      >
                        <option value="">Padrao do fornecedor</option>
                        {centers.map((center) => (
                          <option key={center.id} value={center.id}>
                            {center.code} | {center.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <TextField
                      label="Razao social"
                      onChange={(supplierName) =>
                        setForm((current) => ({ ...current, supplierName }))
                      }
                      required
                      value={form.supplierName}
                    />
                    <TextField
                      label="CNPJ"
                      maxLength={18}
                      onChange={(supplierDocument) =>
                        setForm((current) => ({ ...current, supplierDocument }))
                      }
                      value={form.supplierDocument}
                    />
                    <TextField
                      label="Numero da nota"
                      onChange={(invoiceNumber) =>
                        setForm((current) => ({ ...current, invoiceNumber }))
                      }
                      required
                      value={form.invoiceNumber}
                    />
                    <label className="field">
                      <span>Emissao</span>
                      <input
                        onChange={(event) =>
                          setForm((current) => ({ ...current, issuedAt: event.target.value }))
                        }
                        required
                        type="date"
                        value={form.issuedAt}
                      />
                    </label>
                    <label className="field">
                      <span>Total da nota</span>
                      <input
                        inputMode="decimal"
                        onChange={(event) =>
                          setForm((current) => ({ ...current, total: event.target.value }))
                        }
                        required
                        value={form.total}
                      />
                    </label>
                    <TextField
                      label="Categoria"
                      onChange={(category) => setForm((current) => ({ ...current, category }))}
                      value={form.category}
                    />
                    <TextField
                      label="Natureza da operacao"
                      onChange={(operationNature) =>
                        setForm((current) => ({ ...current, operationNature }))
                      }
                      value={form.operationNature}
                    />
                    <TextField
                      label="Forma de pagamento"
                      onChange={(paymentMethod) =>
                        setForm((current) => ({ ...current, paymentMethod }))
                      }
                      value={form.paymentMethod}
                    />
                    <label className="field span-three">
                      <span>Chave de acesso</span>
                      <input
                        maxLength={54}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, accessKey: event.target.value }))
                        }
                        value={form.accessKey}
                      />
                    </label>
                  </div>
                </fieldset>

                <fieldset disabled={!canWrite || selected.status === 'IMPORTED'}>
                  <legend>
                    <span>Itens</span>
                    <button
                      className="icon-button"
                      disabled={!canWrite || selected.status === 'IMPORTED'}
                      onClick={addItem}
                      title="Adicionar item"
                      type="button"
                    >
                      <Plus size={16} />
                    </button>
                  </legend>
                  <div className="invoice-items-table">
                    <div className="invoice-item-row invoice-item-header">
                      <span>Descricao</span>
                      <span>Qtd.</span>
                      <span>Un.</span>
                      <span>Unitario</span>
                      <span>Negociado</span>
                      <span>Centro</span>
                      <span />
                    </div>
                    {form.items.map((item, index) => (
                      <div className="invoice-item-row" key={`${selected.id}-item-${index}`}>
                        <input
                          aria-label={`Descricao do item ${index + 1}`}
                          onChange={(event) => updateItem(index, 'description', event.target.value)}
                          value={item.description}
                        />
                        <input
                          aria-label={`Quantidade do item ${index + 1}`}
                          inputMode="decimal"
                          onChange={(event) => updateItem(index, 'quantity', event.target.value)}
                          value={item.quantity}
                        />
                        <input
                          aria-label={`Unidade do item ${index + 1}`}
                          onChange={(event) => updateItem(index, 'unit', event.target.value)}
                          value={item.unit}
                        />
                        <input
                          aria-label={`Valor unitario do item ${index + 1}`}
                          inputMode="decimal"
                          onChange={(event) => updateItem(index, 'unitPrice', event.target.value)}
                          value={item.unitPrice}
                        />
                        <input
                          aria-label={`Valor negociado do item ${index + 1}`}
                          inputMode="decimal"
                          onChange={(event) => updateItem(index, 'negotiatedPrice', event.target.value)}
                          placeholder="Opcional"
                          value={item.negotiatedPrice}
                        />
                        <select
                          aria-label={`Centro de custo do item ${index + 1}`}
                          onChange={(event) => updateItem(index, 'costCenterId', event.target.value)}
                          value={item.costCenterId}
                        >
                          <option value="">Padrao</option>
                          {centers.map((center) => (
                            <option key={center.id} value={center.id}>
                              {center.code} | {center.name}
                            </option>
                          ))}
                        </select>
                        <button
                          aria-label={`Remover item ${index + 1}`}
                          className="icon-button danger-icon"
                          disabled={form.items.length === 1}
                          onClick={() => removeItem(index)}
                          title="Remover item"
                          type="button"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="invoice-total-check">
                    <span>Total informado: <strong>{currency.format(numberValue(form.total))}</strong></span>
                    <span className={Math.abs(calculatedTotal - numberValue(form.total)) > 0.05 ? 'mismatch' : ''}>
                      Soma dos itens: <strong>{currency.format(calculatedTotal)}</strong>
                    </span>
                  </div>
                </fieldset>

                <fieldset disabled={!canWrite || selected.status === 'IMPORTED'}>
                  <legend>
                    <span>Parcelas</span>
                    <button
                      className="icon-button"
                      disabled={!canWrite || selected.status === 'IMPORTED'}
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          installments: [...current.installments, { amount: '', dueDate: '' }],
                        }))
                      }
                      title="Adicionar parcela"
                      type="button"
                    >
                      <Plus size={16} />
                    </button>
                  </legend>
                  {form.installments.length ? (
                    <div className="installment-grid">
                      {form.installments.map((installment, index) => (
                        <div className="invoice-installment-row" key={`${selected.id}-installment-${index}`}>
                          <input
                            aria-label={`Vencimento da parcela ${index + 1}`}
                            onChange={(event) => updateInstallment(index, 'dueDate', event.target.value)}
                            type="date"
                            value={installment.dueDate}
                          />
                          <input
                            aria-label={`Valor da parcela ${index + 1}`}
                            inputMode="decimal"
                            onChange={(event) => updateInstallment(index, 'amount', event.target.value)}
                            placeholder="Valor"
                            value={installment.amount}
                          />
                          <button
                            aria-label={`Remover parcela ${index + 1}`}
                            className="icon-button danger-icon"
                            onClick={() =>
                              setForm((current) => ({
                                ...current,
                                installments: current.installments.filter(
                                  (_, installmentIndex) => installmentIndex !== index,
                                ),
                              }))
                            }
                            title="Remover parcela"
                            type="button"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="subtle-empty">Sem parcelamento informado.</p>
                  )}
                </fieldset>

                <label className="field" aria-disabled={!canWrite || selected.status === 'IMPORTED'}>
                  <span>Observacoes</span>
                  <textarea
                    disabled={!canWrite || selected.status === 'IMPORTED'}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, notes: event.target.value }))
                    }
                    rows={3}
                    value={form.notes}
                  />
                </label>

                {rejecting && (
                  <div className="reject-document-row">
                    <input
                      onChange={(event) => setRejectReason(event.target.value)}
                      placeholder="Motivo da retirada do escopo"
                      value={rejectReason}
                    />
                    <button
                      className="danger-button"
                      disabled={busy === 'reject'}
                      onClick={() => void rejectDocument()}
                      type="button"
                    >
                      <Ban size={16} />
                      Confirmar
                    </button>
                    <button className="secondary-button" onClick={() => setRejecting(false)} type="button">
                      Cancelar
                    </button>
                  </div>
                )}

                <footer className="invoice-review-actions">
                  {canWrite && selected.status !== 'IMPORTED' && (
                    <>
                      <button
                        className="secondary-button"
                        disabled={busy !== null}
                        onClick={() => void reprocessDocument()}
                        type="button"
                      >
                        <RefreshCw className={busy === 'reprocess' ? 'spin' : ''} size={16} />
                        Reprocessar
                      </button>
                      <button
                        className="secondary-button danger-secondary"
                        disabled={busy !== null}
                        onClick={() => setRejecting(true)}
                        type="button"
                      >
                        <Ban size={16} />
                        Fora do escopo
                      </button>
                      <button className="primary-button" disabled={busy !== null} type="submit">
                        <Save size={16} />
                        {busy === 'review' ? 'Salvando' : 'Salvar conferencia'}
                      </button>
                    </>
                  )}
                  {canWrite && selected.status === 'READY' && (
                    <button
                      className="primary-button import-button"
                      disabled={busy !== null}
                      onClick={() => void importDocument()}
                      type="button"
                    >
                      <SendToBack size={16} />
                      {busy === 'import' ? 'Importando' : 'Importar compra'}
                    </button>
                  )}
                </footer>
              </form>
            </>
          ) : (
            <div className="empty-table-state">Selecione um documento fiscal.</div>
          )}
        </section>
      </div>
    </div>
  );
}

function TextField({
  label,
  maxLength,
  onChange,
  required = false,
  value,
}: {
  label: string;
  maxLength?: number;
  onChange: (value: string) => void;
  required?: boolean;
  value: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        value={value}
      />
    </label>
  );
}

function formFromDocument(
  document: InvoiceDocumentDetail,
  suppliers: Supplier[],
): ReviewForm {
  const source = document.review ?? document.extraction;
  if (!source) return emptyForm;
  const matchedSupplier = document.review?.supplierId
    ? suppliers.find((supplier) => supplier.id === document.review?.supplierId)
    : suppliers.find(
        (supplier) =>
          document.supplierDocument &&
          digitsOnly(supplier.document) === digitsOnly(document.supplierDocument),
      );
  const reviewItems = document.review?.items;
  return {
    accessKey: source.accessKey ?? '',
    category: source.category ?? '',
    defaultCostCenterId:
      document.review?.defaultCostCenterId ?? matchedSupplier?.defaultCostCenterId ?? '',
    installments: source.installments.map((installment) => ({
      amount: String(installment.amount),
      dueDate: installment.dueDate,
    })),
    invoiceNumber: source.invoiceNumber ?? '',
    issuedAt: source.issuedAt ?? '',
    items: source.items.map((item, index) => ({
      costCenterId: reviewItems?.[index]?.costCenterId ?? '',
      description: item.description,
      negotiatedPrice:
        reviewItems?.[index]?.negotiatedPrice !== null &&
        reviewItems?.[index]?.negotiatedPrice !== undefined
          ? String(reviewItems[index]?.negotiatedPrice)
          : '',
      quantity: String(item.quantity),
      unit: item.unit ?? '',
      unitPrice: String(item.unitPrice),
    })),
    notes: document.review?.notes ?? '',
    operationNature: source.operationNature ?? '',
    paymentMethod: source.paymentMethod ?? '',
    supplierDocument: source.supplierDocument ?? '',
    supplierId: document.review?.supplierId ?? matchedSupplier?.id ?? '',
    supplierName: source.supplierName ?? matchedSupplier?.legalName ?? '',
    total: source.total !== null ? String(source.total) : '',
  };
}

function toReviewInput(form: ReviewForm): InvoiceReviewInput {
  return {
    accessKey: digitsOnly(form.accessKey) || null,
    category: nullable(form.category),
    defaultCostCenterId: form.defaultCostCenterId || null,
    installments: form.installments.map((installment) => ({
      amount: numberValue(installment.amount),
      dueDate: installment.dueDate,
    })),
    invoiceNumber: form.invoiceNumber.trim(),
    issuedAt: form.issuedAt,
    items: form.items.map((item) => ({
      costCenterId: item.costCenterId || null,
      description: item.description.trim(),
      negotiatedPrice: item.negotiatedPrice ? numberValue(item.negotiatedPrice) : null,
      quantity: numberValue(item.quantity),
      unit: nullable(item.unit),
      unitPrice: numberValue(item.unitPrice),
    })),
    notes: nullable(form.notes),
    operationNature: nullable(form.operationNature),
    paymentMethod: nullable(form.paymentMethod),
    supplierDocument: digitsOnly(form.supplierDocument) || null,
    supplierId: form.supplierId || null,
    supplierName: form.supplierName.trim(),
    total: numberValue(form.total),
  };
}

function summaryFromDetail(detail: InvoiceDocumentDetail): InvoiceDocumentSummary {
  const { extraction: _extraction, review: _review, ...summary } = detail;
  return summary;
}

function statusLabel(status: InvoiceDocumentStatus): string {
  return {
    FAILED: 'Falha',
    IMPORTED: 'Importada',
    IMPORTING: 'Importando',
    OUT_OF_SCOPE: 'Fora do escopo',
    PROCESSING: 'Processando',
    READY: 'Pronta',
    REVIEW_REQUIRED: 'Conferir',
  }[status];
}

function importMessage(result: InvoiceImportResult): string {
  return {
    ATTACHED_INVOICE: 'Nota vinculada a uma compra existente sem duplicar o lancamento.',
    CREATED: 'Compra criada a partir da nota fiscal conferida.',
    LINKED_EXISTING: 'Nota vinculada ao lancamento ja existente.',
  }[result.action];
}

function numberValue(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  const normalized = trimmed.includes(',')
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed;
  const result = Number(normalized);
  return Number.isFinite(result) ? result : 0;
}

function nullable(value: string): string | null {
  return value.trim() || null;
}

function digitsOnly(value: string | null): string {
  return (value ?? '').replace(/\D/g, '');
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.';
}
