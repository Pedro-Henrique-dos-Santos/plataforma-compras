import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type {
  CreateOrganizationInput,
  DashboardSummary,
  InviteOrganizationMemberInput,
  OrganizationMember,
  OrganizationSummary,
  UpdateOrganizationMemberInput,
  UserContext,
} from '@compras/contracts';

import logoMark from './assets/egestao-mark.svg';
import { AppShell, type ViewId } from './components/AppShell';
import { LoginScreen } from './components/LoginScreen';
import { OrganizationSetupScreen } from './components/OrganizationSetupScreen';
import { PasswordResetScreen } from './components/PasswordResetScreen';
import { apiGet, apiPatch, apiPost } from './lib/api';
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
const PurchasesView = lazy(() =>
  import('./components/PurchasesView').then((module) => ({
    default: module.PurchasesView,
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
const InvoiceDocumentsView = lazy(() =>
  import('./components/InvoiceDocumentsView').then((module) => ({
    default: module.InvoiceDocumentsView,
  })),
);

export default function App() {
  const [sessionState, setSessionState] = useState<SessionState>('checking');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserContext | null>(null);
  const [activeOrganizationId, setActiveOrganizationId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
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
    void apiGet<DashboardSummary>('/dashboard/summary', {
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
  }, [accessToken, activeOrganization, dataRevision]);

  useEffect(() => {
    if (!activeOrganization || view !== 'access') {
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
  }, [accessToken, activeOrganization, view]);

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
  if (!activeOrganization) {
    return (
      <OrganizationSetupScreen
        canCreate={user.platformRoles.includes('PLATFORM_OWNER')}
        onCreate={handleCreateOrganization}
        onSignOut={() => void handleSignOut()}
      />
    );
  }

  const canWriteOperationalData =
    user.platformRoles.includes('PLATFORM_OWNER') ||
    activeOrganization.role !== 'REPORT_VIEWER';
  const canConfigureOrganization =
    user.platformRoles.includes('PLATFORM_OWNER') ||
    activeOrganization.role === 'ORGANIZATION_ADMIN';

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
          <DashboardView loading={dashboardLoading} summary={dashboard} />
        )}
        {view === 'purchases' && (
          <PurchasesView
            accessToken={accessToken}
            canWrite={canWriteOperationalData}
            onChanged={handleOperationalChanged}
            organizationId={activeOrganization.id}
          />
        )}
        {view === 'suppliers' && (
          <SuppliersView
            accessToken={accessToken}
            canWrite={canWriteOperationalData}
            onChanged={handleOperationalChanged}
            organizationId={activeOrganization.id}
          />
        )}
        {view === 'prices' && (
          <PricesView
            accessToken={accessToken}
            canWrite={canWriteOperationalData}
            onChanged={handleOperationalChanged}
            organizationId={activeOrganization.id}
          />
        )}
        {view === 'cost-centers' && (
          <CostCentersView
            accessToken={accessToken}
            canWrite={canWriteOperationalData}
            onChanged={handleOperationalChanged}
            organizationId={activeOrganization.id}
          />
        )}
        {view === 'integrations' && (
          <IntegrationsView
            accessToken={accessToken}
            canConfigure={canConfigureOrganization}
            canWrite={canWriteOperationalData}
            onChanged={handleOperationalChanged}
            organizationId={activeOrganization.id}
          />
        )}
        {view === 'invoice-documents' && (
          <InvoiceDocumentsView
            accessToken={accessToken}
            canWrite={canWriteOperationalData}
            onChanged={handleOperationalChanged}
            organizationId={activeOrganization.id}
          />
        )}
        {view === 'organizations' && (
          <OrganizationsView
            activeOrganization={activeOrganization}
            onCreate={handleCreateOrganization}
            onSelect={handleOrganizationChange}
            organizations={user.organizations}
          />
        )}
        {view === 'access' && (
          <AccessView
            activeOrganization={activeOrganization}
            loading={membersLoading}
            members={members}
            onInvite={handleInviteMember}
            onUpdate={handleUpdateMember}
            user={user}
          />
        )}
        {view === 'settings' && <SettingsView onThemeChange={setTheme} theme={theme} />}
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.';
}
