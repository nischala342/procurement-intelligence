import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider, RequireAuth, useAuth } from './features/auth';
import { AdvisoryPage } from './pages/AdvisoryPage';
import { IngestionPage } from './pages/IngestionPage';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { ProductsPage } from './pages/ProductsPage';
import { VendorsPage } from './pages/VendorsPage';
import { SignupPage } from './pages/SignupPage';
import { ApiError } from './shared/api';
import { useHashRoute } from './shared/hooks/useHashRoute';
import { AppShell } from './shared/ui/AppShell';
import './shared/ui/styles.css';
import './shared/ui/components.css';
import './shared/ui/auth.css';

const NAV = [
  { route: 'overview', label: 'Overview' },
  { route: 'advisory', label: 'Advisory' },
  { route: 'vendors', label: 'Vendors' },
  { route: 'products', label: 'Products' },
  { route: 'ingestion', label: 'Ingestion' },
];
const PAGES: Record<string, () => JSX.Element> = { overview: OverviewPage, advisory: AdvisoryPage, vendors: VendorsPage, products: ProductsPage, ingestion: IngestionPage };

// Server-state cache for the vendors feature. Client errors (4xx) are not retried.
const queryClientInstance = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => !(err instanceof ApiError && err.status && err.status < 500) && count < 2,
    },
  },
});

function App() {
  const route = useHashRoute('overview');
  const { user, isAuthenticated, loading, logout } = useAuth();
  const isAuthRoute = route === 'login' || route === 'signup';
  const queryClient = useQueryClient();

  // Drop all cached server data whenever the signed-in tenant changes (login, logout, account switch).
  useEffect(() => {
    queryClient.clear();
  }, [user?.tenantId, queryClient]);

  // Signed-in users have no business on the auth screens.
  useEffect(() => {
    if (!loading && isAuthenticated && isAuthRoute) window.location.hash = '#/overview';
  }, [loading, isAuthenticated, isAuthRoute]);

  const handleLogout = () => {
    void logout().then(() => (window.location.hash = '#/login'));
  };

  if (isAuthRoute) return route === 'signup' ? <SignupPage /> : <LoginPage />;

  // unknown routes (including the retired #/system) fall back to the overview
  const active = PAGES[route] ? route : 'overview';
  const Page = PAGES[active]!;

  return (
    <AppShell nav={NAV} active={active} account={user} onLogout={handleLogout}>
      <RequireAuth>
        {/* key=tenant guarantees no client state (queues, caches) survives an account switch */}
        <div key={user?.tenantId}>
          <Page />
        </div>
      </RequireAuth>
    </AppShell>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClientInstance}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
