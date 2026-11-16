import { useEffect, type PropsWithChildren } from 'react';
import { useAuth } from './AuthContext';

/** Renders children only for signed-in users; everyone else is sent to `#/login`. */
export function RequireAuth({ children }: PropsWithChildren) {
  const { isAuthenticated, loading } = useAuth();

  useEffect(() => {
    if (!loading && !isAuthenticated) window.location.hash = '#/login';
  }, [loading, isAuthenticated]);

  if (loading) return <p className="auth-loading" role="status">Checking your session…</p>;
  if (!isAuthenticated) return null;
  return <>{children}</>;
}
