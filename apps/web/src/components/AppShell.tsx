import type { ReactNode } from 'react';
import type { OrganizationSummary, UserContext } from '@compras/contracts';
import {
  BarChart3,
  Building2,
  ChevronDown,
  LogOut,
  Menu,
  ShieldCheck,
  X,
} from 'lucide-react';

export type ViewId = 'dashboard' | 'organizations' | 'access';

type AppShellProps = {
  activeOrganization: OrganizationSummary;
  children: ReactNode;
  mobileMenuOpen: boolean;
  onMobileMenuChange: (open: boolean) => void;
  onOrganizationChange: (organizationId: string) => void;
  onSignOut: () => void;
  onViewChange: (view: ViewId) => void;
  organizations: OrganizationSummary[];
  user: UserContext;
  view: ViewId;
};

const navigation: Array<{
  id: ViewId;
  label: string;
  icon: typeof BarChart3;
  platformOnly?: boolean;
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'organizations', label: 'Empresas', icon: Building2, platformOnly: true },
  { id: 'access', label: 'Acessos', icon: ShieldCheck, platformOnly: true },
];

const viewTitles: Record<ViewId, { title: string; subtitle: string }> = {
  dashboard: {
    title: 'Visao de compras',
    subtitle: 'Indicadores consolidados da empresa ativa',
  },
  organizations: {
    title: 'Empresas',
    subtitle: 'Ambientes vinculados a sua conta',
  },
  access: {
    title: 'Acessos',
    subtitle: 'Papeis globais e empresariais',
  },
};

export function AppShell({
  activeOrganization,
  children,
  mobileMenuOpen,
  onMobileMenuChange,
  onOrganizationChange,
  onSignOut,
  onViewChange,
  organizations,
  user,
  view,
}: AppShellProps) {
  const isPlatformOwner = user.platformRoles.includes('PLATFORM_OWNER');
  const visibleNavigation = navigation.filter((item) => !item.platformOnly || isPlatformOwner);
  const title = viewTitles[view];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="brand-lockup">
          <span className="brand-mark">PC</span>
          <span>
            <strong>Compras</strong>
            <small>Gestao multiempresa</small>
          </span>
          <button
            aria-label="Fechar menu"
            className="sidebar-close"
            onClick={() => onMobileMenuChange(false)}
            title="Fechar menu"
            type="button"
          >
            <X size={19} />
          </button>
        </div>

        <nav className="navigation" aria-label="Navegacao principal">
          <p className="nav-section-label">Operacao</p>
          {visibleNavigation.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={`nav-item ${view === item.id ? 'active' : ''}`}
                key={item.id}
                onClick={() => {
                  onViewChange(item.id);
                  onMobileMenuChange(false);
                }}
                type="button"
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-account">
          <span className="avatar">{initials(user.name)}</span>
          <span className="account-copy">
            <strong>{user.name}</strong>
            <small>Proprietario global</small>
          </span>
          <button
            aria-label="Sair"
            className="sidebar-icon-button"
            onClick={onSignOut}
            title="Sair"
            type="button"
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>

      {mobileMenuOpen && (
        <button
          aria-label="Fechar menu"
          className="sidebar-backdrop"
          onClick={() => onMobileMenuChange(false)}
          type="button"
        />
      )}

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <button
              aria-label="Abrir menu"
              className="mobile-menu-button"
              onClick={() => onMobileMenuChange(true)}
              title="Abrir menu"
              type="button"
            >
              <Menu size={20} />
            </button>
            <span>
              <h1>{title.title}</h1>
              <p>{title.subtitle}</p>
            </span>
          </div>

          <label className="organization-switcher">
            <Building2 size={17} />
            <span className="sr-only">Empresa ativa</span>
            <select
              onChange={(event) => onOrganizationChange(event.target.value)}
              value={activeOrganization.id}
            >
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
            <ChevronDown className="select-chevron" size={15} />
          </label>
        </header>

        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

