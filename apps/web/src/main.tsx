import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider, RequireAuth, useAuth } from './features/auth';
import { DashboardPage } from './pages/DashboardPage';
import { IngestionPage } from './pages/IngestionPage';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { useHashRoute } from './shared/hooks/useHashRoute';
import { AppShell } from './shared/ui/AppShell';
import './shared/ui/styles.css';
import './shared/ui/components.css';
import './shared/ui/auth.css';

const NAV = [
  { route: 'ingestion', label: 'Ingestion' },
  { route: 'system', label: 'System & Items' },
];

function App() {
  const route = useHashRoute('ingestion');
  const { user, isAuthenticated, loading, logout } = useAuth();
  const isAuthRoute = route === 'login' || route === 'signup';

  // Signed-in users have no business on the auth screens.
  useEffect(() => {
    if (!loading && isAuthenticated && isAuthRoute) window.location.hash = '#/ingestion';
  }, [loading, isAuthenticated, isAuthRoute]);

  const handleLogout = () => {
    void logout().then(() => (window.location.hash = '#/login'));
  };

  if (isAuthRoute) return route === 'signup' ? <SignupPage /> : <LoginPage />;

  return (
    <AppShell nav={NAV} active={route === 'system' ? 'system' : 'ingestion'} account={user} onLogout={handleLogout}>
      <RequireAuth>
        {/* key=tenant guarantees no client state (queues, caches) survives an account switch */}
        <div key={user?.tenantId}>{route === 'system' ? <DashboardPage /> : <IngestionPage />}</div>
      </RequireAuth>
    </AppShell>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
