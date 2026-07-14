import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import type {
  DashboardSummary,
  OrganizationSummary,
  UserContext,
} from '@compras/contracts';

import { AppShell, type ViewId } from './components/AppShell';
import { LoginScreen } from './components/LoginScreen';
import { apiGet } from './lib/api';
import { demoMode, supabase } from './lib/auth';
import { resolveInitialOrganization } from './lib/organizations';

type SessionState = 'checking' | 'signed-out' | 'signed-in';

const ACTIVE_ORGANIZATION_KEY = 'compras.active-organization';

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

export default function App() {
  const [sessionState, setSessionState] = useState<SessionState>('checking');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserContext | null>(null);
  const [activeOrganizationId, setActiveOrganizationId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [view, setView] = useState<ViewId>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (demoMode) {
      setSessionState('signed-out');
      return;
    }
    if (!supabase) {
      setSessionState('signed-out');
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token ?? null;
      setAccessToken(token);
      setSessionState(token ? 'signed-in' : 'signed-out');
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const token = session?.access_token ?? null;
      setAccessToken(token);
      setSessionState(token ? 'signed-in' : 'signed-out');
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
  }, [accessToken, activeOrganization]);

  function handleAuthenticated(token: string | null) {
    setAccessToken(token);
    setSessionState('signed-in');
  }

  async function handleSignOut() {
    if (!demoMode && supabase) {
      await supabase.auth.signOut();
    }
    setAccessToken(null);
    setUser(null);
    setDashboard(null);
    setSessionState('signed-out');
  }

  function handleOrganizationChange(organizationId: string) {
    localStorage.setItem(ACTIVE_ORGANIZATION_KEY, organizationId);
    setActiveOrganizationId(organizationId);
    setView('dashboard');
  }

  if (sessionState === 'checking') {
    return <FullPageLoading />;
  }
  if (sessionState === 'signed-out') {
    return <LoginScreen onAuthenticated={handleAuthenticated} />;
  }
  if (!user || !activeOrganization) {
    return error ? (
      <ConnectionError message={error} onExit={() => void handleSignOut()} />
    ) : (
      <FullPageLoading />
    );
  }

  return (
    <AppShell
      activeOrganization={activeOrganization}
      mobileMenuOpen={mobileMenuOpen}
      onMobileMenuChange={setMobileMenuOpen}
      onOrganizationChange={handleOrganizationChange}
      onSignOut={() => void handleSignOut()}
      onViewChange={setView}
      organizations={user.organizations}
      user={user}
      view={view}
    >
      {error && <div className="inline-error">{error}</div>}
      <Suspense fallback={<ViewLoading />}>
        {view === 'dashboard' && (
          <DashboardView loading={dashboardLoading} summary={dashboard} />
        )}
        {view === 'organizations' && (
          <OrganizationsView
            activeOrganization={activeOrganization}
            onSelect={handleOrganizationChange}
            organizations={user.organizations}
          />
        )}
        {view === 'access' && <AccessView activeOrganization={activeOrganization} user={user} />}
      </Suspense>
    </AppShell>
  );
}

function FullPageLoading() {
  return (
    <div className="full-page-state">
      <span className="loading-mark">PC</span>
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
      <span className="loading-mark">PC</span>
      <h1>Nao foi possivel carregar o ambiente</h1>
      <p>{message}</p>
      <button className="secondary-button" onClick={onExit} type="button">
        Voltar ao acesso
      </button>
    </div>
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.';
}
