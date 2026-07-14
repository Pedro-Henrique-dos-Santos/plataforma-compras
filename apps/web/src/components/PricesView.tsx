import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import type {
  ImportSupplierPricesInput,
  PriceStatus,
  Supplier,
  SupplierPrice,
  SupplierPriceImportResult,
  SupplierPriceItemInput,
} from '@compras/contracts';
import { Download, FileUp, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import Papa from 'papaparse';

import { apiGet, apiPost } from '../lib/api';

type PricesViewProps = {
  accessToken: string | null;
  canWrite: boolean;
  onChanged: () => void;
  organizationId: string;
};

type EditablePriceRow = {
  description: string;
  id: string;
  initialPrice: string;
  itemCode: string;
  negotiatedPrice: string;
  unit: string;
  validUntil: string;
};

type CsvRecord = Record<string, string | undefined>;

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function PricesView({
  accessToken,
  canWrite,
  onChanged,
  organizationId,
}: PricesViewProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [prices, setPrices] = useState<SupplierPrice[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | PriceStatus>('ALL');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [rows, setRows] = useState<EditablePriceRow[]>([newRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SupplierPriceImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void Promise.all([
      apiGet<SupplierPrice[]>('/supplier-prices', {
        token: accessToken,
        organizationId,
        signal: controller.signal,
      }),
      apiGet<Supplier[]>('/suppliers?status=ACTIVE', {
        token: accessToken,
        organizationId,
        signal: controller.signal,
      }),
    ])
      .then(([priceRows, supplierRows]) => {
        setPrices(priceRows);
        setSuppliers(supplierRows);
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(errorMessage(requestError));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [accessToken, organizationId, revision]);

  const visiblePrices = useMemo(() => {
    const term = normalize(search);
    return prices.filter((price) => {
      if (supplierFilter !== 'ALL' && price.supplierId !== supplierFilter) return false;
      if (statusFilter !== 'ALL' && price.status !== statusFilter) return false;
      const content = `${price.itemCode ?? ''} ${price.description} ${price.supplierName}`;
      return !term || normalize(content).includes(term);
    });
  }, [prices, search, statusFilter, supplierFilter]);

  function openBatch() {
    setSupplierId(suppliers[0]?.id ?? '');
    setRows([newRow()]);
    setResult(null);
    setError(null);
    setDialogOpen(true);
  }

  function updateRow(id: string, field: keyof Omit<EditablePriceRow, 'id'>, value: string) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, [field]: value } : row));
  }

  function removeRow(id: string) {
    setRows((current) => current.length === 1 ? current : current.filter((row) => row.id !== id));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      if (!supplierId) throw new Error('Selecione um fornecedor.');
      const items = rows.map(toPriceInput);
      const input: ImportSupplierPricesInput = { supplierId, items };
      const imported = await apiPost<SupplierPriceImportResult>('/supplier-prices/import', input, {
        token: accessToken,
        organizationId,
      });
      setResult(imported);
      setRevision((current) => current + 1);
      onChanged();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  function readCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    Papa.parse<CsvRecord>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: normalizeHeader,
      complete: (parsed) => {
        if (parsed.errors.length) {
          setError(`CSV invalido: ${parsed.errors[0]?.message ?? 'nao foi possivel ler o arquivo.'}`);
          return;
        }
        try {
          const importedRows = parsed.data.map(csvToRow).filter((row) => row.description || row.negotiatedPrice);
          if (!importedRows.length) throw new Error('O CSV nao possui itens validos.');
          setRows(importedRows);
          setResult(null);
          setError(null);
          setDialogOpen(true);
        } catch (parseError) {
          setError(errorMessage(parseError));
        }
      },
      error: (parseError) => setError(`Nao foi possivel ler o CSV: ${parseError.message}`),
    });
  }

  function downloadTemplate() {
    const content = 'codigo;descricao;unidade;valor_inicial;valor_negociado;validade\nITEM-001;Produto exemplo;UN;100,00;85,00;2026-12-31\n';
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'modelo-tabela-precos.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="management-layout">
      <section className="section-heading">
        <span><p className="eyebrow">Valores negociados</p><h2>Tabela de precos por fornecedor</h2></span>
        {canWrite && (
          <div className="heading-actions compact-actions">
            <input accept=".csv,text/csv" className="sr-only" onChange={readCsv} ref={fileInput} type="file" />
            <button className="secondary-button" onClick={downloadTemplate} type="button"><Download size={16} />Modelo CSV</button>
            <button className="secondary-button" onClick={() => fileInput.current?.click()} type="button"><Upload size={16} />Importar CSV</button>
            <button className="primary-button" onClick={openBatch} type="button"><Plus size={16} />Cadastrar em lote</button>
          </div>
        )}
      </section>

      <section className="filter-bar panel">
        <label className="search-field"><Search size={16} /><span className="sr-only">Buscar item</span><input onChange={(event) => setSearch(event.target.value)} placeholder="Codigo, descricao ou fornecedor" value={search} /></label>
        <label className="compact-select"><span className="sr-only">Fornecedor</span><select onChange={(event) => setSupplierFilter(event.target.value)} value={supplierFilter}><option value="ALL">Todos os fornecedores</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.tradeName ?? supplier.legalName}</option>)}</select></label>
        <label className="compact-select"><span className="sr-only">Status</span><select onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)} value={statusFilter}><option value="ALL">Todos os status</option><option value="ACTIVE">Ativos</option><option value="EXPIRED">Vencidos</option><option value="INACTIVE">Inativos</option></select></label>
        <span className="count-label">{visiblePrices.length} itens</span>
      </section>

      {error && !dialogOpen && <div className="inline-error">{error}</div>}

      <section className="panel table-panel">
        {loading ? <div className="table-loading">Carregando tabela de precos</div> : (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Codigo</th><th>Descricao</th><th>Fornecedor</th><th>Unidade</th><th className="align-right">Inicial</th><th className="align-right">Negociado</th><th className="align-right">Economia</th><th>Validade</th><th>Status</th></tr></thead>
              <tbody>
                {visiblePrices.length ? visiblePrices.map((price) => (
                  <tr key={price.id}>
                    <td className="order-id">{price.itemCode ?? 'Sem codigo'}</td>
                    <td>{price.description}</td>
                    <td>{price.supplierName}</td>
                    <td>{price.unit ?? 'UN'}</td>
                    <td className="align-right">{price.initialPrice === null ? '-' : currency.format(price.initialPrice)}</td>
                    <td className="align-right amount-cell">{currency.format(price.negotiatedPrice)}</td>
                    <td className="align-right savings-cell">{price.savingsPercentage === null ? '-' : `${price.savingsPercentage.toLocaleString('pt-BR')}%`}</td>
                    <td>{price.validUntil ? formatDate(price.validUntil) : 'Sem vencimento'}</td>
                    <td><span className={`status-label ${price.status === 'ACTIVE' ? 'active' : ''}`}>{priceStatusLabel(price.status)}</span></td>
                  </tr>
                )) : <tr><td className="empty-table-cell" colSpan={9}>Nenhum preco encontrado</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {dialogOpen && (
        <div className="modal-backdrop" role="presentation">
          <section aria-labelledby="price-batch-title" aria-modal="true" className="modal-panel modal-extra-wide" role="dialog">
            <header className="modal-header">
              <span><p className="eyebrow">Cadastro em lote</p><h2 id="price-batch-title">Itens e valores negociados</h2></span>
              <button className="icon-button" onClick={() => setDialogOpen(false)} title="Fechar" type="button"><X size={18} /></button>
            </header>
            <form className="management-form batch-form" onSubmit={(event) => void submit(event)}>
              <label className="supplier-batch-select">Fornecedor<select autoFocus onChange={(event) => setSupplierId(event.target.value)} required value={supplierId}><option value="">Selecione</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.tradeName ?? supplier.legalName}</option>)}</select></label>
              <div className="editable-grid price-grid-header" aria-hidden="true"><span>Codigo</span><span>Descricao</span><span>Unidade</span><span>Valor inicial</span><span>Valor negociado</span><span>Validade</span><span /></div>
              <div className="batch-rows">
                {rows.map((row) => (
                  <div className="editable-grid price-edit-row" key={row.id}>
                    <label><span className="mobile-field-label">Codigo</span><input maxLength={80} onChange={(event) => updateRow(row.id, 'itemCode', event.target.value)} value={row.itemCode} /></label>
                    <label><span className="mobile-field-label">Descricao</span><input maxLength={240} onChange={(event) => updateRow(row.id, 'description', event.target.value)} required value={row.description} /></label>
                    <label><span className="mobile-field-label">Unidade</span><input maxLength={30} onChange={(event) => updateRow(row.id, 'unit', event.target.value.toUpperCase())} value={row.unit} /></label>
                    <label><span className="mobile-field-label">Valor inicial</span><input inputMode="decimal" onChange={(event) => updateRow(row.id, 'initialPrice', event.target.value)} placeholder="0,00" value={row.initialPrice} /></label>
                    <label><span className="mobile-field-label">Valor negociado</span><input inputMode="decimal" onChange={(event) => updateRow(row.id, 'negotiatedPrice', event.target.value)} placeholder="0,00" required value={row.negotiatedPrice} /></label>
                    <label><span className="mobile-field-label">Validade</span><input onChange={(event) => updateRow(row.id, 'validUntil', event.target.value)} type="date" value={row.validUntil} /></label>
                    <button aria-label="Remover item" className="icon-button table-action" disabled={rows.length === 1} onClick={() => removeRow(row.id)} title="Remover item" type="button"><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
              <button className="add-row-button" onClick={() => setRows((current) => [...current, newRow()])} type="button"><Plus size={15} />Adicionar item</button>
              {error && <div className="form-error">{error}</div>}
              {result && <div className="form-success"><FileUp size={17} /><span>{result.created} criados, {result.updated} atualizados, {result.total} processados.</span></div>}
              <footer className="modal-actions"><button className="secondary-button" onClick={() => setDialogOpen(false)} type="button">Fechar</button><button className="primary-button" disabled={submitting || !rows.length} type="submit"><FileUp size={16} />{submitting ? 'Processando' : 'Salvar lote'}</button></footer>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function newRow(): EditablePriceRow {
  return { description: '', id: crypto.randomUUID(), initialPrice: '', itemCode: '', negotiatedPrice: '', unit: 'UN', validUntil: '' };
}

function toPriceInput(row: EditablePriceRow): SupplierPriceItemInput {
  const initialPrice = row.initialPrice.trim() ? parseMoney(row.initialPrice) : null;
  const negotiatedPrice = parseMoney(row.negotiatedPrice);
  if (!row.description.trim()) throw new Error('Todos os itens precisam de descricao.');
  if (!Number.isFinite(negotiatedPrice) || negotiatedPrice < 0) throw new Error(`Valor negociado invalido para ${row.description}.`);
  if (initialPrice !== null && (!Number.isFinite(initialPrice) || initialPrice < 0)) throw new Error(`Valor inicial invalido para ${row.description}.`);
  return {
    itemCode: row.itemCode.trim() || null,
    description: row.description.trim(),
    unit: row.unit.trim() || null,
    initialPrice,
    negotiatedPrice,
    validFrom: null,
    validUntil: row.validUntil || null,
    source: 'CSV',
    notes: null,
  };
}

function csvToRow(record: CsvRecord): EditablePriceRow {
  return {
    id: crypto.randomUUID(),
    itemCode: pick(record, ['codigo', 'codigo_item', 'item_code', 'sku']),
    description: pick(record, ['descricao', 'item', 'produto', 'nome']),
    unit: pick(record, ['unidade', 'un']) || 'UN',
    initialPrice: pick(record, ['valor_inicial', 'preco_inicial', 'valor_tabela']),
    negotiatedPrice: pick(record, ['valor_negociado', 'preco_negociado', 'valor', 'preco']),
    validUntil: normalizeCsvDate(pick(record, ['validade', 'validade_final', 'valid_until'])),
  };
}

function pick(record: CsvRecord, aliases: string[]): string {
  for (const alias of aliases) {
    const value = record[alias]?.trim();
    if (value) return value;
  }
  return '';
}

function normalizeHeader(value: string): string {
  return normalize(value).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function normalizeCsvDate(value: string): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
}

function parseMoney(value: string): number {
  const compact = value.replace(/R\$|\s/g, '');
  const normalized = compact.includes(',') ? compact.replace(/\./g, '').replace(',', '.') : compact;
  return Number(normalized);
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${value}T00:00:00.000Z`));
}

function priceStatusLabel(status: PriceStatus): string {
  return { ACTIVE: 'Ativo', EXPIRED: 'Vencido', INACTIVE: 'Inativo' }[status];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Nao foi possivel processar a tabela de precos.';
}
