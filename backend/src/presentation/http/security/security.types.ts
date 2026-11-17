import type { AdminRole, Permission } from './permissions.js';

export interface AuthenticatedPrincipal {
  readonly id: string;
  readonly roles: readonly AdminRole[];
  readonly permissions: readonly Permission[];
  readonly idempotencyScope: string;
}

export type RequestSecurityContext =
  | { readonly mode: 'local-development' }
  | { readonly mode: 'oidc'; readonly principal: AuthenticatedPrincipal };

export interface SecuredRequest {
  readonly headers: Record<string, string | string[] | undefined>;
  readonly method: string;
  readonly path: string;
  readonly route?: { readonly path?: string };
  readonly params: Record<string, string | undefined>;
  security?: RequestSecurityContext;
}

export interface AuthSessionResponse {
  readonly mode: 'local-development' | 'oidc';
  readonly authenticated: boolean;
  readonly roles: readonly AdminRole[];
  readonly permissions: readonly Permission[];
}
