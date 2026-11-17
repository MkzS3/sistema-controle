import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, ACCESS_DENIED_EVENT, apiClient, SESSION_EXPIRED_EVENT, type AccessTokenProvider } from '../api/api-client.js';
import { authApi } from '../api/auth-api.js';
import type { Permission } from './types.js';

export type AuthSessionState =
  | { readonly status: 'loading' }
  | { readonly status: 'local-development' }
  | { readonly status: 'authenticated'; readonly roles: readonly string[]; readonly permissions: readonly Permission[] }
  | { readonly status: 'unauthenticated' }
  | { readonly status: 'session-expired' }
  | { readonly status: 'access-denied' }
  | { readonly status: 'unavailable'; readonly message: string };

interface AuthSessionContextValue {
  readonly state: AuthSessionState;
  can(permission: Permission): boolean;
  refresh(): void;
}

const developmentValue: AuthSessionContextValue = {
  state: { status: 'local-development' },
  can: () => true,
  refresh: () => undefined,
};

const AuthSessionContext = createContext<AuthSessionContextValue>(developmentValue);

export function AuthSessionProvider({ children, tokenProvider }: { children: ReactNode; tokenProvider?: AccessTokenProvider }) {
  const [state, setState] = useState<AuthSessionState>({ status: 'loading' });
  const [refreshCount, setRefreshCount] = useState(0);

  useEffect(() => {
    let active = true;
    apiClient.setAccessTokenProvider(tokenProvider);
    const onExpired = () => setState((previous) => previous.status === 'authenticated' ? { status: 'session-expired' } : previous);
    const onDenied = () => setState((previous) => previous.status === 'authenticated' ? { status: 'access-denied' } : previous);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    window.addEventListener(ACCESS_DENIED_EVENT, onDenied);
    authApi.session().then((session) => {
      if (!active) return;
      if (session.mode === 'local-development' && !session.authenticated) {
        setState({ status: 'local-development' });
      } else if (session.mode === 'oidc' && session.authenticated) {
        setState({ status: 'authenticated', roles: session.roles, permissions: session.permissions });
      } else {
        setState({ status: 'unauthenticated' });
      }
    }).catch((error: unknown) => {
      if (!active) return;
      if (error instanceof ApiError && error.status === 401) setState({ status: 'unauthenticated' });
      else if (error instanceof ApiError && error.status === 403) setState({ status: 'access-denied' });
      else setState({ status: 'unavailable', message: error instanceof Error ? error.message : 'Não foi possível verificar a sessão.' });
    });
    return () => {
      active = false;
      window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
      window.removeEventListener(ACCESS_DENIED_EVENT, onDenied);
      apiClient.setAccessTokenProvider(undefined);
    };
  }, [refreshCount, tokenProvider]);

  const value = useMemo<AuthSessionContextValue>(() => ({
    state,
    can: (permission) => state.status === 'local-development'
      || (state.status === 'authenticated' && state.permissions.includes(permission)),
    refresh: () => setRefreshCount((count) => count + 1),
  }), [state]);

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession(): AuthSessionContextValue {
  return useContext(AuthSessionContext);
}

export function AuthStateScreen({ state, onRetry }: { state: AuthSessionState; onRetry: () => void }) {
  if (state.status === 'loading') return <main className="auth-state-screen" role="status">Verificando sessão…</main>;
  if (state.status === 'local-development' || state.status === 'authenticated') return null;
  if (state.status === 'unauthenticated') return <main className="auth-state-screen" aria-labelledby="auth-state-heading">
    <h1 id="auth-state-heading">Autenticação necessária</h1>
    <p>Esta API exige uma sessão emitida pelo provedor de identidade configurado. O painel não oferece login local.</p>
  </main>;
  if (state.status === 'session-expired') return <main className="auth-state-screen" aria-labelledby="auth-state-heading">
    <h1 id="auth-state-heading">Sessão expirada</h1>
    <p>Volte ao provedor de identidade e obtenha uma sessão válida antes de continuar.</p>
  </main>;
  if (state.status === 'access-denied') return <main className="auth-state-screen" aria-labelledby="auth-state-heading">
    <h1 id="auth-state-heading">Acesso negado</h1>
    <p>Sua identidade autenticada não possui a permissão necessária para esta operação.</p>
  </main>;
  return <main className="auth-state-screen" aria-labelledby="auth-state-heading">
    <h1 id="auth-state-heading">Não foi possível verificar a sessão</h1>
    <p role="alert">{state.message}</p>
    <button className="button button-secondary" onClick={onRetry}>Tentar novamente</button>
  </main>;
}
