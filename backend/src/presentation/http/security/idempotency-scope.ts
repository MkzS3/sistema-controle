import { requiredString } from '../../../application/use-cases/request-validation.js';
import type { SecuredRequest } from './security.types.js';

export function effectiveIdempotencyScope(request: SecuredRequest, headerValue: string | undefined): string {
  const suppliedScope = requiredString(headerValue, 'Idempotency-Scope');
  if (request.security?.mode === 'oidc') return request.security.principal.idempotencyScope;
  return suppliedScope;
}
