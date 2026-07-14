import type { ReactNode } from 'react';
import type { OrganizationSummary, UserContext } from '@compras/contracts';
import {
  BarChart3,
  Building2,
  ChevronDown,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react';

import logoMark from '../assets/egestao-mark.svg';

export type ViewId = 'dashboard' | 'organizations' | 'access' | 'settings';

type AppShellProps = {
  activeOrganization: OrganizationSummary;
  children: ReactNode;
  mobileMenuOpen: boolean;
  onMobileMenuChange: (open: boolean) => void;
  onOrganizationChange: (organizationId: string) => void;
  onSidebarCollapsedChange: (collapsed: boolean) => void;
  onSignOut: () => void;
  onViewChange: (view: ViewId) => void;
  organizations: OrganizationSummary[];
  sidebarCollapsed: boolean;
  user: UserContext;
  view: ViewId;
};

const navigation: Array<{
  id: ViewId;
  label: string;
  icon: typeof BarChart3;
  visibility?: 'platform-owner' | 'organization-admin';
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { id: 'organizations', label: 'Empresas', icon: Building2, visibility: 'platform-owner' },
  { id: 'access', label: 'Acessos', icon: ShieldCheck, visibility: 'organization-admin' },
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
    subtitle: 'Papeis e usuarios da empresa ativa',
  },
  settings: {
    title: 'Configuracoes',
    subtitle: 'Preferencias deste navegador',
  },
};

export function AppShell({
  activeOrganization,
  children,
  mobileMenuOpen,
  onMobileMenuChange,
  onOrganizationChange,
  onSidebarCollapsedChange,
  onSignOut,
  onViewChange,
  organizations,
  sidebarCollapsed,
  user,
  view,
}: AppShellProps) {
  const isPlatformOwner = user.platformRoles.includes('PLATFORM_OWNER');
  const isOrganizationAdmin = activeOrganization.role === 'ORGANIZATION_ADMIN';
  const visibleNavigation = navigation.filter((item) => {
    if (item.visibility === 'platform-owner') {
      return isPlatformOwner;
    }
    if (item.visibility === 'organization-admin') {
      return isPlatformOwner || isOrganizationAdmin;
    }
    return true;
  });
  const title = viewTitles[view];

  function selectView(nextView: ViewId) {
    onViewChange(nextView);
    onMobileMenuChange(false);
  }

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className={`sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="brand-lockup sidebar-brand">
          <img alt="" className="brand-logo" src={logoMark} />
          <span className="brand-lockup-copy">
            <strong>E-Gestão Compras</strong>
            <small>Gestao multiempresa</small>
          </span>
          <button
            aria-label={sidebarCollapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
            className="sidebar-collapse-button"
            onClick={() => onSidebarCollapsedChange(!sidebarCollapsed)}
            title={sidebarCollapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
            type="button"
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
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
                aria-current={view === item.id ? 'page' : undefined}
                className={`nav-item ${view === item.id ? 'active' : ''}`}
                key={item.id}
                onClick={() => selectView(item.id)}
                title={sidebarCollapsed ? item.label : undefined}
                type="button"
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <nav className="navigation utility-navigation" aria-label="Preferencias">
          <button
            aria-current={view === 'settings' ? 'page' : undefined}
            className={`nav-item ${view === 'settings' ? 'active' : ''}`}
            onClick={() => selectView('settings')}
            title={sidebarCollapsed ? 'Configuracoes' : undefined}
            type="button"
          >
            <Settings size={18} />
            <span>Configuracoes</span>
          </button>
        </nav>

        <div className="sidebar-account">
          <span className="avatar">{initials(user.name)}</span>
          <span className="account-copy">
            <strong>{user.name}</strong>
            <small>{accountRole(isPlatformOwner, activeOrganization.role)}</small>
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
              <p>{activeOrganization.name} | {title.subtitle}</p>
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

function accountRole(isPlatformOwner: boolean, role: OrganizationSummary['role']): string {
  if (isPlatformOwner) {
    return 'Proprietario global';
  }
  return {
    ORGANIZATION_ADMIN: 'Administrador',
    BUYER: 'Comprador',
    REPORT_VIEWER: 'Relatorios',
  }[role];
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}
