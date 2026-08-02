import { useState, type FormEvent } from 'react';
import type {
  CreateOrganizationInput,
  OrganizationSummary,
  UpdateOrganizationInput,
} from '@compras/contracts';
import { Building2, Check, ExternalLink, Pencil, Plus, Save, X } from 'lucide-react';

type OrganizationsViewProps = {
  activeOrganization: OrganizationSummary;
  canCreate: boolean;
  canManage: boolean;
  onCreate: (input: CreateOrganizationInput) => Promise<void>;
  onSelect: (organizationId: string) => void;
  onUpdate: (input: UpdateOrganizationInput) => Promise<void>;
  organizations: OrganizationSummary[];
};

type OrganizationForm = {
  name: string;
  legalName: string;
  document: string;
  email: string;
  phone: string;
  postalCode: string;
  street: string;
  addressNumber: string;
  addressComplement: string;
  district: string;
  city: string;
  state: string;
};

export function OrganizationsView({
  activeOrganization,
  canCreate,
  canManage,
  onCreate,
  onSelect,
  onUpdate,
  organizations,
}: OrganizationsViewProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<OrganizationSummary | null>(null);
  const [name, setName] = useState('');
  const [document, setDocument] = useState('');
  const [form, setForm] = useState<OrganizationForm>(() => organizationForm(activeOrganization));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onCreate({ name, document: document || null });
      setName('');
      setDocument('');
      setCreateOpen(false);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onUpdate({
        name: form.name,
        legalName: form.legalName || null,
        document: form.document || null,
        email: form.email || null,
        phone: form.phone || null,
        postalCode: form.postalCode || null,
        street: form.street || null,
        addressNumber: form.addressNumber || null,
        addressComplement: form.addressComplement || null,
        district: form.district || null,
        city: form.city || null,
        state: form.state || null,
      });
      setEditing(null);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  function openEdit(organization: OrganizationSummary) {
    setError(null);
    setForm(organizationForm(organization));
    setEditing(organization);
  }

  function formField(field: keyof OrganizationForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="management-layout">
      <section className="section-heading">
        <span>
          <p className="eyebrow">{canCreate ? 'Administracao global' : 'Cadastro da empresa'}</p>
          <h2>Empresas cadastradas</h2>
        </span>
        <div className="heading-actions">
          <span className="count-label">
            {organizations.length} {organizations.length === 1 ? 'ambiente' : 'ambientes'}
          </span>
          {canCreate && (
            <button className="primary-button" onClick={() => setCreateOpen(true)} type="button">
              <Plus size={16} />
              Nova empresa
            </button>
          )}
        </div>
      </section>

      <section className="organization-grid">
        {organizations.map((organization) => {
          const selected = organization.id === activeOrganization.id;
          return (
            <article className={`organization-card ${selected ? 'selected' : ''}`} key={organization.id}>
              <div className="organization-card-top">
                <span className="organization-icon">
                  <Building2 size={20} />
                </span>
                <div className="organization-card-actions">
                  <span className={`status-label ${organization.active ? 'active' : ''}`}>
                    {organization.active ? 'Ativa' : 'Inativa'}
                  </span>
                  {canManage && selected && (
                    <button
                      aria-label="Editar empresa"
                      className="icon-button"
                      onClick={() => openEdit(organization)}
                      title="Editar empresa"
                      type="button"
                    >
                      <Pencil size={16} />
                    </button>
                  )}
                </div>
              </div>
              <div className="organization-card-copy">
                <h3>{organization.name}</h3>
                <p>{organization.legalName || roleLabel(organization.role)}</p>
                <small>{organization.document ? formatCnpj(organization.document) : 'CNPJ nao informado'}</small>
                <small>{organization.city && organization.state ? `${organization.city}/${organization.state}` : 'Endereco nao informado'}</small>
              </div>
              <button
                className={selected ? 'secondary-button selected-company' : 'secondary-button'}
                disabled={selected}
                onClick={() => onSelect(organization.id)}
                type="button"
              >
                {selected ? <Check size={16} /> : <ExternalLink size={16} />}
                {selected ? 'Empresa ativa' : 'Acessar empresa'}
              </button>
            </article>
          );
        })}
      </section>

      {createOpen && (
        <div className="modal-backdrop" role="presentation">
          <section aria-labelledby="create-company-title" aria-modal="true" className="modal-panel" role="dialog">
            <header className="modal-header">
              <span>
                <p className="eyebrow">Novo ambiente</p>
                <h2 id="create-company-title">Cadastrar empresa</h2>
              </span>
              <button aria-label="Fechar" className="icon-button" onClick={() => setCreateOpen(false)} title="Fechar" type="button">
                <X size={18} />
              </button>
            </header>
            <form className="management-form" onSubmit={(event) => void handleCreate(event)}>
              <label>
                Nome exibido da empresa
                <input autoFocus maxLength={120} onChange={(event) => setName(event.target.value)} required value={name} />
              </label>
              <label>
                CNPJ
                <input autoCapitalize="characters" maxLength={18} onChange={(event) => setDocument(event.target.value.toUpperCase())} placeholder="AA.AAA.AAA/AAAA-00" value={document} />
              </label>
              {error && <div className="form-error">{error}</div>}
              <footer className="modal-actions">
                <button className="secondary-button" onClick={() => setCreateOpen(false)} type="button">Cancelar</button>
                <button className="primary-button" disabled={submitting} type="submit">
                  <Plus size={16} />
                  {submitting ? 'Cadastrando' : 'Cadastrar empresa'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {editing && (
        <div className="modal-backdrop" role="presentation">
          <section aria-labelledby="edit-company-title" aria-modal="true" className="modal-panel modal-wide" role="dialog">
            <header className="modal-header">
              <span>
                <p className="eyebrow">Dados cadastrais</p>
                <h2 id="edit-company-title">Editar empresa</h2>
              </span>
              <button aria-label="Fechar" className="icon-button" onClick={() => setEditing(null)} title="Fechar" type="button">
                <X size={18} />
              </button>
            </header>
            <form className="management-form" onSubmit={(event) => void handleUpdate(event)}>
              <div className="form-grid two-columns">
                <label>Nome exibido<input autoFocus maxLength={120} onChange={(event) => formField('name', event.target.value)} required value={form.name} /></label>
                <label>Razao social<input maxLength={160} onChange={(event) => formField('legalName', event.target.value)} value={form.legalName} /></label>
                <label>CNPJ<input autoCapitalize="characters" maxLength={18} onChange={(event) => formField('document', event.target.value.toUpperCase())} placeholder="AA.AAA.AAA/AAAA-00" value={form.document} /></label>
                <label>E-mail<input maxLength={255} onChange={(event) => formField('email', event.target.value)} type="email" value={form.email} /></label>
                <label>Telefone<input maxLength={30} onChange={(event) => formField('phone', event.target.value)} value={form.phone} /></label>
                <label>CEP<input inputMode="numeric" maxLength={9} onChange={(event) => formField('postalCode', event.target.value)} placeholder="00000-000" value={form.postalCode} /></label>
                <label>Logradouro<input maxLength={160} onChange={(event) => formField('street', event.target.value)} value={form.street} /></label>
                <label>Numero<input maxLength={30} onChange={(event) => formField('addressNumber', event.target.value)} value={form.addressNumber} /></label>
                <label>Complemento<input maxLength={100} onChange={(event) => formField('addressComplement', event.target.value)} value={form.addressComplement} /></label>
                <label>Bairro<input maxLength={100} onChange={(event) => formField('district', event.target.value)} value={form.district} /></label>
                <label>Cidade<input maxLength={100} onChange={(event) => formField('city', event.target.value)} value={form.city} /></label>
                <label>UF<input maxLength={2} onChange={(event) => formField('state', event.target.value.toUpperCase())} value={form.state} /></label>
              </div>
              {error && <div className="form-error">{error}</div>}
              <footer className="modal-actions">
                <button className="secondary-button" onClick={() => setEditing(null)} type="button">Cancelar</button>
                <button className="primary-button" disabled={submitting} type="submit">
                  <Save size={16} />
                  {submitting ? 'Salvando' : 'Salvar empresa'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function organizationForm(organization: OrganizationSummary): OrganizationForm {
  return {
    name: organization.name,
    legalName: organization.legalName ?? '',
    document: organization.document ? formatCnpj(organization.document) : '',
    email: organization.email ?? '',
    phone: organization.phone ?? '',
    postalCode: organization.postalCode ? formatPostalCode(organization.postalCode) : '',
    street: organization.street ?? '',
    addressNumber: organization.addressNumber ?? '',
    addressComplement: organization.addressComplement ?? '',
    district: organization.district ?? '',
    city: organization.city ?? '',
    state: organization.state ?? '',
  };
}

function roleLabel(role: OrganizationSummary['role']) {
  const labels: Record<OrganizationSummary['role'], string> = {
    ORGANIZATION_ADMIN: 'Administrador da empresa',
    BUYER: 'Comprador',
    FINANCE: 'Financeiro',
    REPORT_VIEWER: 'Consulta de relatorios',
  };
  return labels[role];
}

function formatCnpj(value: string): string {
  return value.replace(/^([A-Z0-9]{2})([A-Z0-9]{3})([A-Z0-9]{3})([A-Z0-9]{4})(\d{2})$/i, '$1.$2.$3/$4-$5');
}

function formatPostalCode(value: string): string {
  return value.replace(/^(\d{5})(\d{3})$/, '$1-$2');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Nao foi possivel salvar a empresa.';
}
