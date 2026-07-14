import { useState, type FormEvent } from 'react';
import type { CreateOrganizationInput, OrganizationSummary } from '@compras/contracts';
import { Building2, Check, ExternalLink, Plus, X } from 'lucide-react';

type OrganizationsViewProps = {
  activeOrganization: OrganizationSummary;
  onCreate: (input: CreateOrganizationInput) => Promise<void>;
  onSelect: (organizationId: string) => void;
  organizations: OrganizationSummary[];
};

export function OrganizationsView({
  activeOrganization,
  onCreate,
  onSelect,
  organizations,
}: OrganizationsViewProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState('');
  const [document, setDocument] = useState('');
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
      setDialogOpen(false);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="management-layout">
      <section className="section-heading">
        <span>
          <p className="eyebrow">Administracao global</p>
          <h2>Empresas cadastradas</h2>
        </span>
        <div className="heading-actions">
          <span className="count-label">{organizations.length} ambientes</span>
          <button className="primary-button" onClick={() => setDialogOpen(true)} type="button">
            <Plus size={16} />
            Nova empresa
          </button>
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
                <span className={`status-label ${organization.active ? 'active' : ''}`}>
                  {organization.active ? 'Ativa' : 'Inativa'}
                </span>
              </div>
              <div className="organization-card-copy">
                <h3>{organization.name}</h3>
                <p>{roleLabel(organization.role)}</p>
                <small>{organization.document ? formatCnpj(organization.document) : 'CNPJ nao informado'}</small>
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

      {dialogOpen && (
        <div className="modal-backdrop" role="presentation">
          <section aria-labelledby="create-company-title" aria-modal="true" className="modal-panel" role="dialog">
            <header className="modal-header">
              <span>
                <p className="eyebrow">Novo ambiente</p>
                <h2 id="create-company-title">Cadastrar empresa</h2>
              </span>
              <button
                aria-label="Fechar"
                className="icon-button"
                onClick={() => setDialogOpen(false)}
                title="Fechar"
                type="button"
              >
                <X size={18} />
              </button>
            </header>
            <form className="management-form" onSubmit={(event) => void handleCreate(event)}>
              <label>
                Razao social ou nome
                <input
                  autoFocus
                  maxLength={120}
                  onChange={(event) => setName(event.target.value)}
                  required
                  value={name}
                />
              </label>
              <label>
                CNPJ
                <input
                  inputMode="numeric"
                  maxLength={18}
                  onChange={(event) => setDocument(event.target.value)}
                  placeholder="00.000.000/0000-00"
                  value={document}
                />
              </label>
              {error && <div className="form-error">{error}</div>}
              <footer className="modal-actions">
                <button className="secondary-button" onClick={() => setDialogOpen(false)} type="button">
                  Cancelar
                </button>
                <button className="primary-button" disabled={submitting} type="submit">
                  <Plus size={16} />
                  {submitting ? 'Cadastrando' : 'Cadastrar empresa'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function roleLabel(role: OrganizationSummary['role']) {
  const labels: Record<OrganizationSummary['role'], string> = {
    ORGANIZATION_ADMIN: 'Administrador da empresa',
    BUYER: 'Comprador',
    REPORT_VIEWER: 'Consulta de relatorios',
  };
  return labels[role];
}

function formatCnpj(value: string): string {
  return value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Nao foi possivel cadastrar a empresa.';
}
