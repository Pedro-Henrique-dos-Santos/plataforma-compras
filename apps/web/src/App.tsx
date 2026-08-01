import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type {
  CreateOrganizationInput,
  DashboardFilters,
  DashboardSummary,
  InviteOrganizationMemberInput,
  OrganizationMember,
  OrganizationSummary,
  UpdateOrganizationInput,
  UpdateOrganizationMemberInput,
  UpdateUserProfileInput,
  UserContext,
} from '@compras/contracts';
import {
  hasAccessPermission,
  hasCurrentLegalAcceptance,
} from '@compras/contracts';

import logoMark from './assets/egestao-mark.svg';
import { AppShell, type ViewId } from './components/AppShell';
import { ConsentScreen } from './components/ConsentScreen';
import { LoginScreen } from './components/LoginScreen';
import { OrganizationSetupScreen } from './components/OrganizationSetupScreen';
import { PasswordResetScreen } from './components/PasswordResetScreen';
import { apiGet, apiPatch, apiPost } from './lib/api';
import { getOrganizationCapabilities } from './lib/access';
import { demoMode, supabase } from './lib/auth';
import { resolveInitialOrganization } from './lib/organizations';
import { parseThemeMode, type ThemeMode } from './lib/theme';

type SessionState = 'checking' | 'signed-out' | 'signed-in' | 'password-recovery';

const ACTIVE_ORGANIZATION_KEY = 'egestao.active-organization';
const SIDEBAR_COLLAPSED_KEY = 'egestao.sidebar-collapsed';
const THEME_KEY = 'egestao.theme';

const DashboardView = lazy(() =>
  import('./components/DashboardView').then((module) => ({
    default: module.DashboardView,
  })),
);
const OrganizationsView = lazy(() =>
  import('./components/OrganizationsView').then((module) => ({
    default: module.OrganizationsView,
  })),
);
const AccessView = lazy(() =>
  import('./components/AccessView').then((module) => ({
    default: module.AccessView,
  })),
);
const SettingsView = lazy(() =>
  import('./components/SettingsView').then((module) => ({
    default: module.SettingsView,
  })),
);
const ReportsView = lazy(() =>
  import('./components/ReportsView').then((module) => ({
    default: module.ReportsView,
  })),
);
const PurchasesView = lazy(() =>
  import('./components/PurchasesView').then((module) => ({
    default: module.PurchasesView,
  })),
);
const ApprovalsView = lazy(() =>
  import('./components/ApprovalsView').then((module) => ({
    default: module.ApprovalsView,
  })),
);
const FinancialWorkflowView = lazy(() =>
  import('./components/FinancialWorkflowView').then((module) => ({
    default: module.FinancialWorkflowView,
  })),
);
const ApprovalSettingsView = lazy(() =>
  import('./components/ApprovalSettingsView').then((module) => ({
    default: module.ApprovalSettingsView,
  })),
);
const FinancialSettingsView = lazy(() =>
  import('./components/FinancialSettingsView').then((module) => ({
    default: module.FinancialSettingsView,
  })),
);
const SuppliersView = lazy(() =>
  import('./components/SuppliersView').then((module) => ({
    default: module.SuppliersView,
  })),
);
const PricesView = lazy(() =>
  import('./components/PricesView').then((module) => ({
    default: module.PricesView,
  })),
);
const CostCentersView = lazy(() =>
  import('./components/CostCentersView').then((module) => ({
    default: module.CostCentersView,
  })),
);
const IntegrationsView = lazy(() =>
  import('./components/IntegrationsView').then((module) => ({
    default: module.IntegrationsView,
  })),
);
const FiscalWorkspaceView = lazy(() =>
  import('./components/FiscalWorkspaceView').then((module) => ({
    default: module.FiscalWorkspaceView,
  })),
);

export default function App() {
  const [sessionState, setSessionState] = useState<SessionState>('checking');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserContext | null>(null);
  const [activeOrganizationId, setActiveOrganizationId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardFilters, setDashboardFilters] = useState<DashboardFilters>({
    includeUndated: true,
  });
  const [dataRevision, setDataRevision] = useState(0);
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [view, setView] = useState<ViewId>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true',
  );
  const [theme, setTheme] = useState<ThemeMode>(() =>
    parseThemeMode(localStorage.getItem(THEME_KEY)),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (demoMode) {
      setSessionState('signed-out');
      return;
    }
    if (!supabase) {
      setSessionState('signed-out');
      return;
    }

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      const token = session?.access_token ?? null;
      setAccessToken(token);
      if (event === 'PASSWORD_RECOVERY') {
        setSessionState('password-recovery');
        return;
      }
      setSessionState((current) =>
        current === 'password-recovery' ? current : token ? 'signed-in' : 'signed-out',
      );
    });

    void supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token ?? null;
      setAccessToken(token);
      setSessionState((current) =>
        current === 'password-recovery' ? current : token ? 'signed-in' : 'signed-out',
      );
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (sessionState !== 'signed-in') {
      return;
    }

    const controller = new AbortController();
    setError(null);
    void apiGet<UserContext>('/auth/me', {
      token: accessToken,
      signal: controller.signal,
    })
      .then((context) => {
        setUser(context);
        const initial = resolveInitialOrganization(
          context.organizations,
          localStorage.getItem(ACTIVE_ORGANIZATION_KEY),
        );
        setActiveOrganizationId(initial?.id ?? null);
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(errorMessage(requestError));
        }
      });

    return () => controller.abort();
  }, [accessToken, sessionState]);

  const activeOrganization = useMemo(
    () =>
      user?.organizations.find(
        (organization) => organization.id === activeOrganizationId,
      ) ?? null,
    [activeOrganizationId, user],
  );

  useEffect(() => {
    if (!activeOrganization) {
      setDashboard(null);
      return;
    }

    const controller = new AbortController();
    setDashboardLoading(true);
    setError(null);
    void apiGet<DashboardSummary>(`/dashboard/summary${dashboardQuery(dashboardFilters)}`, {
      token: accessToken,
      organizationId: activeOrganization.id,
      signal: controller.signal,
    })
      .then(setDashboard)
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(errorMessage(requestError));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setDashboardLoading(false);
        }
      });

    return () => controller.abort();
  }, [accessToken, activeOrganization, dashboardFilters, dataRevision]);

  useEffect(() => {
    if (
      !activeOrganization ||
      !user ||
      view !== 'access' ||
      !hasAccessPermission(
        user.platformRoles,
        activeOrganization.role,
        'member:manage',
      )
    ) {
      return;
    }

    const controller = new AbortController();
    setMembersLoading(true);
    setError(null);
    void apiGet<OrganizationMember[]>(
      `/organizations/${activeOrganization.id}/members`,
      {
        token: accessToken,
        organizationId: activeOrganization.id,
        signal: controller.signal,
      },
    )
      .then((result) => setMembers(sortMembers(result)))
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setError(errorMessage(requestError));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setMembersLoading(false);
        }
      });

    return () => controller.abort();
  }, [accessToken, activeOrganization, user, view]);

  function handleAuthenticated(token: string | null) {
    setAccessToken(token);
    setSessionState('signed-in');
  }

  function handlePasswordResetComplete() {
    window.history.replaceState({}, '', window.location.pathname);
    setSessionState('signed-in');
  }

  async function handleSignOut() {
    if (!demoMode && supabase) {
      await supabase.auth.signOut();
    }
    setAccessToken(null);
    setUser(null);
    setDashboard(null);
    setMembers([]);
    setSessionState('signed-out');
  }

  function handleOrganizationChange(organizationId: string) {
    localStorage.setItem(ACTIVE_ORGANIZATION_KEY, organizationId);
    setActiveOrganizationId(organizationId);
    setMembers([]);
    setDashboardFilters({ includeUndated: true });
    setError(null);
    setView('dashboard');
  }

  function handleSidebarCollapsedChange(collapsed: boolean) {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
    setSidebarCollapsed(collapsed);
  }

  async function handleCreateOrganization(input: CreateOrganizationInput): Promise<void> {
    const organization = await apiPost<OrganizationSummary>('/organizations', input, {
      token: accessToken,
    });
    setUser((current) =>
      current
        ? { ...current, organizations: [...current.organizations, organization] }
        : current,
    );
    localStorage.setItem(ACTIVE_ORGANIZATION_KEY, organization.id);
    setActiveOrganizationId(organization.id);
    setView('dashboard');
  }

  async function handleUpdateOrganization(input: UpdateOrganizationInput): Promise<void> {
    if (!activeOrganization) {
      throw new Error('Selecione uma empresa antes de alterar o cadastro.');
    }
    const updated = await apiPatch<OrganizationSummary>(
      `/organizations/${activeOrganization.id}`,
      input,
      { token: accessToken, organizationId: activeOrganization.id },
    );
    setUser((current) =>
      current
        ? {
            ...current,
            organizations: current.organizations.map((organization) =>
              organization.id === updated.id ? updated : organization,
            ),
          }
        : current,
    );
  }

  async function handleProfileUpdate(input: UpdateUserProfileInput): Promise<void> {
    const updated = await apiPatch<UserContext>('/auth/profile', input, {
      token: accessToken,
    });
    setUser(updated);
  }

  async function handleInviteMember(input: InviteOrganizationMemberInput): Promise<void> {
    if (!activeOrganization) {
      throw new Error('Selecione uma empresa antes de convidar usuarios.');
    }
    const member = await apiPost<OrganizationMember>(
      `/organizations/${activeOrganization.id}/members`,
      input,
      { token: accessToken, organizationId: activeOrganization.id },
    );
    setMembers((current) => sortMembers(upsertMember(current, member)));
  }

  async function handleUpdateMember(
    membershipId: string,
    input: UpdateOrganizationMemberInput,
  ): Promise<void> {
    if (!activeOrganization) {
      throw new Error('Selecione uma empresa antes de alterar usuarios.');
    }
    const member = await apiPatch<OrganizationMember>(
      `/organizations/${activeOrganization.id}/members/${membershipId}`,
      input,
      { token: accessToken, organizationId: activeOrganization.id },
    );
    setMembers((current) => sortMembers(upsertMember(current, member)));
  }

  function handleOperationalChanged() {
    setDataRevision((current) => current + 1);
  }

  if (sessionState === 'checking') {
    return <FullPageLoading />;
  }
  if (sessionState === 'signed-out') {
    return <LoginScreen onAuthenticated={handleAuthenticated} />;
  }
  if (sessionState === 'password-recovery') {
    return <PasswordResetScreen onComplete={handlePasswordResetComplete} />;
  }
  if (!user) {
    return error ? (
      <ConnectionError message={error} onExit={() => void handleSignOut()} />
    ) : (
      <FullPageLoading />
    );
  }
  if (!hasCurrentLegalAcceptance(user)) {
    return (
      <ConsentScreen
        onAccept={() => handleProfileUpdate({ acceptTerms: true, acceptPrivacy: true })}
        onSignOut={() => void handleSignOut()}
      />
    );
  }
  if (!activeOrganization) {
    return (
      <OrganizationSetupScreen
        canCreate={hasAccessPermission(
          user.platformRoles,
          undefined,
          'platform:manage',
        )}
        onCreate={handleCreateOrganization}
        onSignOut={() => void handleSignOut()}
      />
    );
  }

  const capabilities = getOrganizationCapabilities(user, activeOrganization);

  return (
    <AppShell
      activeOrganization={activeOrganization}
      mobileMenuOpen={mobileMenuOpen}
      onMobileMenuChange={setMobileMenuOpen}
      onOrganizationChange={handleOrganizationChange}
      onSidebarCollapsedChange={handleSidebarCollapsedChange}
      onSignOut={() => void handleSignOut()}
      onViewChange={(nextView) => {
        setError(null);
        setView(nextView);
      }}
      organizations={user.organizations}
      sidebarCollapsed={sidebarCollapsed}
      user={user}
      view={view}
    >
      {error && <div className="inline-error">{error}</div>}
      <Suspense fallback={<ViewLoading />}>
        {view === 'dashboard' && (
          <DashboardView
            accessToken={accessToken}
            filters={dashboardFilters}
            loading={dashboardLoading}
            onFiltersChange={setDashboardFilters}
            organizationId={activeOrganization.id}
            summary={dashboard}
          />
        )}
        {view === 'reports' && (
          <ReportsView
            accessToken={accessToken}
            organizationId={activeOrganization.id}
          />
        )}
        {view === 'purchases' && (
          <PurchasesView
            accessToken={accessToken}
            canWrite={capabilities.canWritePurchases}
            onChanged={handleOperationalChanged}
            organizationId={activeOrganization.id}
          />
        )}
        {view === 'approvals' && capabilities.canActOnApprovals && (
          <ApprovalsView
            accessToken={accessToken}
            onChanged={handleOperationalChanged}
            organizationId={activeOrganization.id}
          />
        )}
        {view === 'payables' && (
          <FinancialWorkflowView
            accessToken={accessToken}
            canActOnApprovals={capabilities.canActOnPaymentApprovals}
            canSettle={capabilities.canSettlePayments}
            canWrite={capabilities.canWritePayables}
            onChanged={handleOperationalChanged}
            organizationId={activeOrganization.id}
          />
        )}
        {view === 'approval-settings' && capabilities.canManageApprovals && (
          <ApprovalSettingsView
            accessToken={accessToken}
            organizationId={activeOrganization.id}
          />
        )}
        {view === 'financial-settings' && capabilities.canManagePaymentApprovals && (
          <FinancialSettingsView
            accessToken={accessToken}
            organizationId={activeOrganization.id}
          />
        )}
        {view === 'suppliers' && (
          <SuppliersView
            accessToken={accessToken}
            canWrite={capabilities.canWriteSuppliers}
            onChanged={handleOperationalChanged}
            organizationId={activeOrganization.id}
          />
        )}
        {view === 'prices' && (
          <PricesView
            accessToken={accessToken}
            canWrite={capabilities.canWritePrices}
            onChanged={handleOperationalChanged}
            organizationId={activeOrganization.id}
          />
        )}
        {view === 'cost-centers' && (
          <CostCentersView
            accessToken={accessToken}
            canWrite={capabilities.canWriteCostCenters}
            onChanged={handleOperationalChanged}
            organizationId={activeOrganization.id}
          />
        )}
        {view === 'integrations' && (
          <IntegrationsView
            accessToken={accessToken}
            canConfigure={capabilities.canManageOrganization}
            canWrite={capabilities.canWriteIntegrations}
            onChanged={handleOperationalChanged}
            organizationId={activeOrganization.id}
          />
        )}
        {view === 'invoice-documents' && (
          <FiscalWorkspaceView
            accessToken={accessToken}
            canConfigure={capabilities.canManageFiscalIntegration}
            canWrite={capabilities.canWriteInvoices}
            onChanged={handleOperationalChanged}
            organizationId={activeOrganization.id}
          />
        )}
        {view === 'organizations' && capabilities.canManageOrganization && (
          <OrganizationsView
            activeOrganization={activeOrganization}
            canCreate={capabilities.canManagePlatform}
            canManage={capabilities.canManageOrganization}
            onCreate={handleCreateOrganization}
            onSelect={handleOrganizationChange}
            onUpdate={handleUpdateOrganization}
            organizations={user.organizations}
          />
        )}
        {view === 'access' && capabilities.canManageMembers && (
          <AccessView
            activeOrganization={activeOrganization}
            loading={membersLoading}
            members={members}
            onInvite={handleInviteMember}
            onUpdate={handleUpdateMember}
            user={user}
          />
        )}
        {view === 'settings' && (
          <SettingsView
            onProfileUpdate={handleProfileUpdate}
            onThemeChange={setTheme}
            theme={theme}
            user={user}
          />
        )}
      </Suspense>
    </AppShell>
  );
}

function FullPageLoading() {
  return (
    <div className="full-page-state">
      <img alt="" className="loading-logo" src={logoMark} />
      <p>Carregando ambiente</p>
    </div>
  );
}

function ViewLoading() {
  return <div className="skeleton view-loading" aria-label="Carregando conteudo" />;
}

function ConnectionError({ message, onExit }: { message: string; onExit: () => void }) {
  return (
    <div className="full-page-state error-state">
      <img alt="" className="loading-logo" src={logoMark} />
      <h1>Nao foi possivel carregar o ambiente</h1>
      <p>{message}</p>
      <button className="secondary-button" onClick={onExit} type="button">
        Voltar ao acesso
      </button>
    </div>
  );
}

function upsertMember(current: OrganizationMember[], next: OrganizationMember): OrganizationMember[] {
  const exists = current.some((member) => member.id === next.id);
  return exists
    ? current.map((member) => (member.id === next.id ? next : member))
    : [...current, next];
}

function sortMembers(members: OrganizationMember[]): OrganizationMember[] {
  return [...members].sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'));
}

function dashboardQuery(filters: DashboardFilters): string {
  const query = new URLSearchParams();
  if (filters.dateFrom) query.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) query.set('dateTo', filters.dateTo);
  if (filters.supplierId) query.set('supplierId', filters.supplierId);
  if (filters.costCenterId) query.set('costCenterId', filters.costCenterId);
  if (filters.category) query.set('category', filters.category);
  query.set('includeUndated', String(filters.includeUndated));
  return `?${query.toString()}`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.';
}
