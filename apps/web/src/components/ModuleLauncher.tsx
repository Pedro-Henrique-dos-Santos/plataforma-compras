import type { OrganizationSummary, UserContext } from '@compras/contracts';
import { ArrowRight, Building2, ChevronDown, LogOut, Settings } from 'lucide-react';

import logoMark from '../assets/egestao-mark.svg';
import {
  getVisibleModuleNavigation,
  getVisibleModules,
  type AppModuleId,
} from '../module-navigation';

type ModuleLauncherProps = {
  activeOrganization: OrganizationSummary;
  onModuleSelect: (moduleId: AppModuleId) => void;
  onOpenSettings: () => void;
  onOrganizationChange: (organizationId: string) => void;
  onSignOut: () => void;
  organizations: OrganizationSummary[];
  user: UserContext;
};

export function ModuleLauncher({
  activeOrganization,
  onModuleSelect,
  onOpenSettings,
  onOrganizationChange,
  onSignOut,
  organizations,
  user,
}: ModuleLauncherProps) {
  const modules = getVisibleModules(user, activeOrganization);

  return (
    <div className="module-launcher">
      <header className="module-launcher-header">
        <div className="brand-lockup module-launcher-brand">
          <img alt="" className="brand-logo" src={logoMark} />
          <span>
            <strong>E-Gestão Compras</strong>
            <small>Gestao multiempresa</small>
          </span>
        </div>

        <div className="module-launcher-actions">
          <label className="organization-switcher module-organization-switcher">
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
          <button
            aria-label="Configuracoes"
            className="icon-button module-header-button"
            onClick={onOpenSettings}
            title="Configuracoes"
            type="button"
          >
            <Settings size={18} />
          </button>
          <div className="module-account">
            <span className="avatar">{initials(user.name)}</span>
            <span>
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </span>
          </div>
          <button
            aria-label="Sair"
            className="icon-button module-header-button"
            onClick={onSignOut}
            title="Sair"
            type="button"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <main className="module-launcher-content">
        <div className="module-launcher-title">
          <p className="eyebrow">{activeOrganization.name}</p>
          <h1>Modulos</h1>
        </div>

        <section aria-label="Modulos disponiveis" className="module-grid">
          {modules.map((module) => {
            const Icon = module.icon;
            const routes = getVisibleModuleNavigation(module.id, user, activeOrganization);
            return (
              <button
                aria-label={`Abrir modulo ${module.label}`}
                className={`module-card module-card-${module.tone}`}
                key={module.id}
                onClick={() => onModuleSelect(module.id)}
                type="button"
              >
                <span className="module-card-heading">
                  <span className="module-card-icon"><Icon size={23} /></span>
                  <span>
                    <strong>{module.label}</strong>
                    <small>{module.summary}</small>
                  </span>
                  <ArrowRight size={20} />
                </span>
                <span className="module-card-routes" aria-hidden="true">
                  {routes.slice(0, 4).map((route) => (
                    <span key={route.id}>{route.label}</span>
                  ))}
                  {routes.length > 4 && <span>Mais {routes.length - 4} areas</span>}
                </span>
                <span className="module-card-footer">{routes.length} areas disponiveis</span>
              </button>
            );
          })}
        </section>
      </main>
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
