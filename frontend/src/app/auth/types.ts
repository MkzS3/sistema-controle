export type Permission =
  | 'session:read'
  | 'dashboard:read'
  | 'beneficiaries:read'
  | 'beneficiaries:create'
  | 'dividends:read'
  | 'dividends:create'
  | 'dividends:declare'
  | 'obligations:read'
  | 'obligations:create'
  | 'payments:read'
  | 'payments:request'
  | 'ledger:read'
  | 'audit:read'
  | 'system:metrics:read';

export interface AuthSessionResponse {
  readonly mode: 'local-development' | 'oidc';
  readonly authenticated: boolean;
  readonly roles: readonly string[];
  readonly permissions: readonly Permission[];
}
