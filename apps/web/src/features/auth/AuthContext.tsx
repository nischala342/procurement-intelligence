import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { ApiError, UNAUTHORIZED_EVENT } from '../../shared/api';
import { setDisplayCurrency } from '../../shared/lib/format';
import * as api from './api';
import type { AuthUser } from './types';

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  /** True until the initial `/auth/me` check resolves. */
  loading: boolean;
  login: (p: api.LoginPayload) => Promise<void>;
  signup: (p: api.SignupPayload) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Session state backed by the HTTP-only cookie: the browser never sees the token, only the user profile. */
export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  // money is formatted in the signed-in organization's base currency; set before any tenant screen renders
  const setUser = useCallback((u: AuthUser | null) => {
    setDisplayCurrency(u?.baseCurrency);
    setUserState(u);
  }, []);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .fetchMe()
      .then((s) => !cancelled && setUser(s.user))
      .catch((e: unknown) => {
        if (!(e instanceof ApiError && e.status === 401)) console.warn('Session check failed', e);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [setUser]);

  // A 401 anywhere (expired session) signs the user out.
  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [setUser]);

  const login = useCallback(async (p: api.LoginPayload) => setUser((await api.login(p)).user), [setUser]);
  const signup = useCallback(async (p: api.SignupPayload) => setUser((await api.signup(p)).user), [setUser]);
  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null); // always drop local state, even if the request failed
    }
  }, [setUser]);

  const value = useMemo<AuthState>(() => ({ user, isAuthenticated: user !== null, loading, login, signup, logout }), [user, loading, login, signup, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
