import type { OrganizationSummary } from '@compras/contracts';
import { Building2, Check, ExternalLink } from 'lucide-react';

type OrganizationsViewProps = {
  activeOrganization: OrganizationSummary;
  onSelect: (organizationId: string) => void;
  organizations: OrganizationSummary[];
};

export function OrganizationsView({
  activeOrganization,
  onSelect,
  organizations,
}: OrganizationsViewProps) {
  return (
    <div className="management-layout">
      <section className="section-heading">
        <span>
          <p className="eyebrow">Administracao global</p>
          <h2>Empresas cadastradas</h2>
        </span>
        <span className="count-label">{organizations.length} ambientes</span>
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

