import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type {
  CostCenter,
  CreateSupplierInput,
  PixKeyType,
  Supplier,
  SupplierCnpjLookup,
  SupplierStatus,
  UpdateSupplierInput,
} from '@compras/contracts';
import { LoaderCircle, Pencil, Plus, Power, PowerOff, Search, Store, X } from 'lucide-react';

import { apiGet, apiPatch, apiPost } from '../lib/api';

type SuppliersViewProps = {
  accessToken: string | null;
  canWrite: boolean;
  onChanged: () => void;
  organizationId: string;
};

type SupplierForm = {
  addressComplement: string;
  addressNumber: string;
  category: string;
  city: string;
  defaultCostCenterId: string;
  document: string;
  district: string;
  email: string;
  legalName: string;
  notes: string;
  operationNature: string;
  paymentMethod: string;
  paymentLink: string;
  phone: string;
  postalCode: string;
  primaryActivity: string;
  pixBeneficiaryDocument: string;
  pixBeneficiaryName: string;
  pixKey: string;
  pixKeyType: '' | PixKeyType;
  registrationStatus: string;
  state: string;
  street: string;
  tradeName: string;
};

const emptyForm: SupplierForm = {
  addressComplement: '',
  addressNumber: '',
  category: '',
  city: '',
  defaultCostCenterId: '',
  document: '',
  district: '',
  email: '',
  legalName: '',
  notes: '',
  operationNature: '',
  paymentMethod: '',
  paymentLink: '',
  phone: '',
  postalCode: '',
  primaryActivity: '',
  pixBeneficiaryDocument: '',
  pixBeneficiaryName: '',
  pixKey: '',
  pixKeyType: '',
  registrationStatus: '',
  state: '',
  street: '',
  tradeName: '',
};

export function SuppliersView({
  accessToken,
  canWrite,
  onChanged,
  organizationId,
}: SuppliersViewProps) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'ALL' | SupplierStatus>('ALL');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<SupplierForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void Promise.all([
      apiGet<Supplier[]>('/suppliers', {
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
      .then(([supplierRows, centerRows]) => {
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
  }, [accessToken, organizationId]);

  const visibleSuppliers = useMemo(() => {
    const term = normalize(search);
    return suppliers.filter((supplier) => {
      if (status !== 'ALL' && supplier.status !== status) return false;
      const content = `${supplier.legalName} ${supplier.tradeName ?? ''} ${supplier.document ?? ''} ${supplier.category ?? ''}`;
      return !term || normalize(content).includes(term);
    });
  }, [search, status, suppliers]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setLookupMessage(null);
    setError(null);
    setDialogOpen(true);
  }

  function openEdit(supplier: Supplier) {
    setEditing(supplier);
    setForm({
      addressComplement: supplier.addressComplement ?? '',
      addressNumber: supplier.addressNumber ?? '',
      category: supplier.category ?? '',
      city: supplier.city ?? '',
      defaultCostCenterId: supplier.defaultCostCenterId ?? '',
      document: supplier.document ?? '',
      district: supplier.district ?? '',
      email: supplier.email ?? '',
      legalName: supplier.legalName,
      notes: supplier.notes ?? '',
      operationNature: supplier.operationNature ?? '',
      paymentMethod: supplier.paymentMethod ?? '',
      paymentLink: supplier.paymentLink ?? '',
      phone: supplier.phone ?? '',
      postalCode: supplier.postalCode ?? '',
      primaryActivity: supplier.primaryActivity ?? '',
      pixBeneficiaryDocument: supplier.pixBeneficiaryDocument ?? '',
      pixBeneficiaryName: supplier.pixBeneficiaryName ?? '',
      pixKey: supplier.pixKey ?? '',
      pixKeyType: supplier.pixKeyType ?? '',
      registrationStatus: supplier.registrationStatus ?? '',
      state: supplier.state ?? '',
      street: supplier.street ?? '',
      tradeName: supplier.tradeName ?? '',
    });
    setLookupMessage(null);
    setError(null);
    setDialogOpen(true);
  }

  function field<K extends keyof SupplierForm>(key: K, value: SupplierForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function lookupCnpj() {
    setLookupLoading(true);
    setLookupMessage(null);
    setError(null);
    try {
      const result = await apiGet<SupplierCnpjLookup>(
        `/suppliers/cnpj/${encodeURIComponent(normalizeDocument(form.document))}`,
        { token: accessToken, organizationId },
      );
      setForm((current) => ({
        ...current,
        addressComplement: result.addressComplement ?? current.addressComplement,
        addressNumber: result.addressNumber ?? current.addressNumber,
        city: result.city ?? current.city,
        district: result.district ?? current.district,
        document: formatCnpj(result.document),
        email: result.email ?? current.email,
        legalName: result.legalName,
        phone: result.phone ?? current.phone,
        postalCode: result.postalCode ? formatPostalCode(result.postalCode) : current.postalCode,
        primaryActivity: result.primaryActivity ?? current.primaryActivity,
        registrationStatus: result.registrationStatus ?? current.registrationStatus,
        state: result.state ?? current.state,
        street: result.street ?? current.street,
        tradeName: result.tradeName ?? current.tradeName,
      }));
      setLookupMessage(
        result.registrationStatus
          ? `Dados localizados. Situacao cadastral: ${result.registrationStatus}.`
          : 'Dados localizados e preenchidos para conferencia.',
      );
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLookupLoading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const input = toInput(form);
    try {
      if (editing) {
        const updated = await apiPatch<Supplier>(
          `/suppliers/${editing.id}`,
          input satisfies UpdateSupplierInput,
          { token: accessToken, organizationId },
        );
        setSuppliers((current) => replace(current, updated));
      } else {
        const created = await apiPost<Supplier>(
          '/suppliers',
          input satisfies CreateSupplierInput,
          { token: accessToken, organizationId },
        );
        setSuppliers((current) => sortSuppliers([...current, created]));
      }
      setDialogOpen(false);
      onChanged();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function toggle(supplier: Supplier) {
    setPendingId(supplier.id);
    setError(null);
    try {
      const updated = await apiPatch<Supplier>(
        `/suppliers/${supplier.id}`,
        { status: supplier.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' },
        { token: accessToken, organizationId },
      );
      setSuppliers((current) => replace(current, updated));
      onChanged();
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
          <p className="eyebrow">Cadastro mestre</p>
          <h2>Fornecedores da empresa</h2>
        </span>
        {canWrite && (
          <button className="primary-button" onClick={openCreate} type="button">
            <Plus size={16} />
            Novo fornecedor
          </button>
        )}
      </section>

      <section className="filter-bar panel">
        <label className="search-field">
          <Search size={16} />
          <span className="sr-only">Buscar fornecedor</span>
          <input onChange={(event) => setSearch(event.target.value)} placeholder="Razao social, nome, CNPJ ou categoria" value={search} />
        </label>
        <label className="compact-select">
          <span className="sr-only">Filtrar por status</span>
          <select onChange={(event) => setStatus(event.target.value as typeof status)} value={status}>
            <option value="ALL">Todos os status</option>
            <option value="ACTIVE">Ativos</option>
            <option value="INACTIVE">Inativos</option>
          </select>
        </label>
        <span className="count-label">{visibleSuppliers.length} fornecedores</span>
      </section>

      {error && !dialogOpen && <div className="inline-error">{error}</div>}

      <section className="panel table-panel">
        {loading ? <div className="table-loading">Carregando fornecedores</div> : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Fornecedor</th>
                  <th>CNPJ</th>
                  <th>Categoria</th>
                  <th>Centro padrao</th>
                  <th className="align-right">Itens negociados</th>
                  <th>Status</th>
                  {canWrite && <th className="align-right">Acoes</th>}
                </tr>
              </thead>
              <tbody>
                {visibleSuppliers.length ? visibleSuppliers.map((supplier) => (
                  <tr key={supplier.id}>
                    <td>
                      <span className="entity-cell">
                        <span className="table-avatar organization"><Store size={16} /></span>
                        <span><strong>{supplier.tradeName ?? supplier.legalName}</strong><small>{supplier.tradeName ? supplier.legalName : supplier.email ?? 'Sem contato cadastrado'}</small></span>
                      </span>
                    </td>
                    <td>{supplier.document ? formatCnpj(supplier.document) : 'Nao informado'}</td>
                    <td>{supplier.category ?? 'Nao definida'}</td>
                    <td>{supplier.defaultCostCenterName ?? 'Nao definido'}</td>
                    <td className="align-right amount-cell">{supplier.priceCount}</td>
                    <td><span className={`status-label ${supplier.status === 'ACTIVE' ? 'active' : ''}`}>{supplier.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}</span></td>
                    {canWrite && (
                      <td className="align-right table-actions-cell">
                        <button className="icon-button table-action" onClick={() => openEdit(supplier)} title="Editar" type="button"><Pencil size={16} /></button>
                        <button
                          className="icon-button table-action"
                          disabled={pendingId === supplier.id}
                          onClick={() => void toggle(supplier)}
                          title={supplier.status === 'ACTIVE' ? 'Inativar' : 'Reativar'}
                          type="button"
                        >
                          {supplier.status === 'ACTIVE' ? <PowerOff size={16} /> : <Power size={16} />}
                        </button>
                      </td>
                    )}
                  </tr>
                )) : <tr><td className="empty-table-cell" colSpan={canWrite ? 7 : 6}>Nenhum fornecedor encontrado</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {dialogOpen && (
        <div className="modal-backdrop" role="presentation">
          <section aria-labelledby="supplier-title" aria-modal="true" className="modal-panel modal-wide" role="dialog">
            <header className="modal-header">
              <span><p className="eyebrow">Cadastro mestre</p><h2 id="supplier-title">{editing ? 'Editar fornecedor' : 'Novo fornecedor'}</h2></span>
              <button className="icon-button" onClick={() => setDialogOpen(false)} title="Fechar" type="button"><X size={18} /></button>
            </header>
            <form className="management-form" onSubmit={(event) => void submit(event)}>
              <div className="form-grid two-columns">
                <div className="cnpj-lookup-field">
                  <label>CNPJ<input autoCapitalize="characters" autoFocus maxLength={18} onChange={(event) => field('document', event.target.value.toUpperCase())} placeholder="00.000.000/0000-00" value={form.document} /></label>
                  <button
                    className="secondary-button compact-button"
                    disabled={lookupLoading || normalizeDocument(form.document).length !== 14}
                    onClick={() => void lookupCnpj()}
                    type="button"
                  >
                    {lookupLoading ? <LoaderCircle className="spin" size={15} /> : <Search size={15} />}
                    Consultar CNPJ
                  </button>
                </div>
                <label>Razao social<input maxLength={160} onChange={(event) => field('legalName', event.target.value)} required value={form.legalName} /></label>
                <label>Nome fantasia<input maxLength={160} onChange={(event) => field('tradeName', event.target.value)} value={form.tradeName} /></label>
                <label>Categoria<input maxLength={100} onChange={(event) => field('category', event.target.value)} value={form.category} /></label>
                <label>Situacao cadastral<input maxLength={80} onChange={(event) => field('registrationStatus', event.target.value)} value={form.registrationStatus} /></label>
                <label>Atividade principal<input maxLength={240} onChange={(event) => field('primaryActivity', event.target.value)} value={form.primaryActivity} /></label>
                <label>Natureza da operacao<input maxLength={100} onChange={(event) => field('operationNature', event.target.value)} value={form.operationNature} /></label>
                <label>Metodo de pagamento<input maxLength={80} onChange={(event) => field('paymentMethod', event.target.value)} value={form.paymentMethod} /></label>
                <label>Tipo de chave Pix<select onChange={(event) => field('pixKeyType', event.target.value as SupplierForm['pixKeyType'])} value={form.pixKeyType}><option value="">Sem Pix cadastrado</option><option value="CNPJ">CNPJ</option><option value="CPF">CPF</option><option value="EMAIL">E-mail</option><option value="PHONE">Telefone</option><option value="RANDOM">Chave aleatoria</option></select></label>
                <label>Chave Pix<input disabled={!form.pixKeyType} maxLength={160} onChange={(event) => field('pixKey', event.target.value)} value={form.pixKey} /></label>
                <label>Beneficiario Pix<input disabled={!form.pixKeyType} maxLength={160} onChange={(event) => field('pixBeneficiaryName', event.target.value)} value={form.pixBeneficiaryName} /></label>
                <label>CPF ou CNPJ do beneficiario<input autoCapitalize="characters" disabled={!form.pixKeyType} maxLength={18} onChange={(event) => field('pixBeneficiaryDocument', event.target.value.toUpperCase())} value={form.pixBeneficiaryDocument} /></label>
                <label>Link de pagamento<input maxLength={500} onChange={(event) => field('paymentLink', event.target.value)} placeholder="https://" type="url" value={form.paymentLink} /></label>
                <label>Centro de custo padrao<select onChange={(event) => field('defaultCostCenterId', event.target.value)} value={form.defaultCostCenterId}><option value="">Sem classificacao automatica</option>{costCenters.map((center) => <option key={center.id} value={center.id}>{center.code} | {center.name}</option>)}</select></label>
                <label>E-mail<input maxLength={255} onChange={(event) => field('email', event.target.value)} type="email" value={form.email} /></label>
                <label>Telefone<input maxLength={30} onChange={(event) => field('phone', event.target.value)} value={form.phone} /></label>
                <label>CEP<input inputMode="numeric" maxLength={9} onChange={(event) => field('postalCode', event.target.value)} value={form.postalCode} /></label>
                <label>Logradouro<input maxLength={160} onChange={(event) => field('street', event.target.value)} value={form.street} /></label>
                <label>Numero<input maxLength={30} onChange={(event) => field('addressNumber', event.target.value)} value={form.addressNumber} /></label>
                <label>Complemento<input maxLength={100} onChange={(event) => field('addressComplement', event.target.value)} value={form.addressComplement} /></label>
                <label>Bairro<input maxLength={100} onChange={(event) => field('district', event.target.value)} value={form.district} /></label>
                <label>Cidade<input maxLength={100} onChange={(event) => field('city', event.target.value)} value={form.city} /></label>
                <label>UF<input maxLength={2} onChange={(event) => field('state', event.target.value.toUpperCase())} value={form.state} /></label>
              </div>
              {lookupMessage && <div className="form-info">{lookupMessage}</div>}
              <label>Observacoes<textarea maxLength={2000} onChange={(event) => field('notes', event.target.value)} rows={3} value={form.notes} /></label>
              {error && <div className="form-error">{error}</div>}
              <footer className="modal-actions">
                <button className="secondary-button" onClick={() => setDialogOpen(false)} type="button">Cancelar</button>
                <button className="primary-button" disabled={submitting} type="submit">{editing ? <Pencil size={16} /> : <Plus size={16} />}{submitting ? 'Salvando' : 'Salvar fornecedor'}</button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function toInput(form: SupplierForm): CreateSupplierInput {
  return {
    legalName: form.legalName,
    tradeName: form.tradeName || null,
    document: form.document || null,
    category: form.category || null,
    operationNature: form.operationNature || null,
    paymentMethod: form.paymentMethod || null,
    pixKeyType: form.pixKeyType || null,
    pixKey: form.pixKey || null,
    pixBeneficiaryName: form.pixBeneficiaryName || null,
    pixBeneficiaryDocument: form.pixBeneficiaryDocument || null,
    paymentLink: form.paymentLink || null,
    defaultCostCenterId: form.defaultCostCenterId || null,
    email: form.email || null,
    phone: form.phone || null,
    postalCode: form.postalCode || null,
    street: form.street || null,
    addressNumber: form.addressNumber || null,
    addressComplement: form.addressComplement || null,
    district: form.district || null,
    city: form.city || null,
    state: form.state || null,
    registrationStatus: form.registrationStatus || null,
    primaryActivity: form.primaryActivity || null,
    notes: form.notes || null,
  };
}

function replace(current: Supplier[], updated: Supplier): Supplier[] {
  return sortSuppliers(current.map((supplier) => supplier.id === updated.id ? updated : supplier));
}

function sortSuppliers(suppliers: Supplier[]): Supplier[] {
  return [...suppliers].sort((left, right) => left.legalName.localeCompare(right.legalName, 'pt-BR'));
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function formatCnpj(value: string): string {
  return value.replace(/^([A-Z0-9]{2})([A-Z0-9]{3})([A-Z0-9]{3})([A-Z0-9]{4})(\d{2})$/i, '$1.$2.$3/$4-$5');
}

function normalizeDocument(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function formatPostalCode(value: string): string {
  return value.replace(/^(\d{5})(\d{3})$/, '$1-$2');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Nao foi possivel alterar o fornecedor.';
}
