import type { ReactNode } from 'react';
import {
  type OrganizationSummary,
  type UserContext,
} from '@compras/contracts';
import {
  Building2,
  ChevronDown,
  LayoutGrid,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  X,
} from 'lucide-react';

import logoMark from '../assets/egestao-mark.svg';
import {
  getAppModule,
  getVisibleModuleNavigationGroups,
  type AppModuleId,
  type ViewId,
} from '../module-navigation';

export type { AppModuleId, ViewId } from '../module-navigation';

type AppShellProps = {
  activeModule: AppModuleId;
  activeOrganization: OrganizationSummary;
  children: ReactNode;
  mobileMenuOpen: boolean;
  onModuleExit: () => void;
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

const viewTitles: Record<ViewId, { title: string; subtitle: string }> = {
  dashboard: {
    title: 'Visao de compras',
    subtitle: 'Indicadores consolidados da empresa ativa',
  },
  reports: {
    title: 'Relatorios',
    subtitle: 'Analise detalhada, filtros e exportacao de compras',
  },
  purchases: {
    title: 'Compras',
    subtitle: 'Fluxo, pedidos, itens e rateios por departamento',
  },
  approvals: {
    title: 'Aprovacoes',
    subtitle: 'Solicitacoes pendentes da sua decisao',
  },
  payables: {
    title: 'Contas a pagar',
    subtitle: 'Vencimentos, pagamentos e previsao financeira',
  },
  receivables: {
    title: 'Contas a receber',
    subtitle: 'Entradas previstas, vencimentos e baixas de recebimento',
  },
  'approval-settings': {
    title: 'Regras de aprovacao',
    subtitle: 'Limites, quorum, aprovadores e notificacoes',
  },
  'financial-settings': {
    title: 'Regras financeiras',
    subtitle: 'Aprovacoes, segregacao e responsaveis pelo recebimento',
  },
  suppliers: {
    title: 'Fornecedores',
    subtitle: 'Cadastro e regras padrao para novos lancamentos',
  },
  prices: {
    title: 'Tabela de precos',
    subtitle: 'Valores negociados e importacoes em lote',
  },
  'cost-centers': {
    title: 'Centros de custo',
    subtitle: 'Departamentos usados na classificacao das compras',
  },
  'invoice-documents': {
    title: 'Notas fiscais',
    subtitle: 'Leitura, conferencia e importacao de documentos',
  },
  integrations: {
    title: 'Automacoes',
    subtitle: 'Sincronizacao e conciliacao com fontes externas',
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
  activeModule,
  activeOrganization,
  children,
  mobileMenuOpen,
  onModuleExit,
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
  const module = getAppModule(activeModule);
  const ModuleIcon = module.icon;
  const navigationGroups = getVisibleModuleNavigationGroups(
    activeModule,
    user,
    activeOrganization,
  );
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

        <button
          className={`sidebar-module-switcher module-tone-${module.tone}`}
          onClick={onModuleExit}
          title={sidebarCollapsed ? 'Voltar aos modulos' : undefined}
          type="button"
        >
          <span className="sidebar-module-icon"><ModuleIcon size={19} /></span>
          <span className="sidebar-module-copy">
            <small>Modulo ativo</small>
            <strong>{module.label}</strong>
          </span>
          <LayoutGrid className="sidebar-module-grid" size={17} />
        </button>

        <nav className="navigation" aria-label={`Navegacao do modulo ${module.label}`}>
          {navigationGroups.map((group) => (
            <section className="nav-group" key={group.label}>
              <p className="nav-section-label">{group.label}</p>
              {group.items.map((item) => {
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
            </section>
          ))}
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

      <div className={`workspace workspace-${view}`}>
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
    FINANCE: 'Financeiro',
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
