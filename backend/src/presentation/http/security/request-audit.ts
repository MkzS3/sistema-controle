import { randomUUID } from 'node:crypto';
import type { SecuredRequest } from './security.types.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requestAuditId(request: SecuredRequest): string {
  const candidate = request.headers['x-correlation-id'];
  if (typeof candidate === 'string' && UUID.test(candidate)) return candidate;
  return randomUUID();
}

export function routeTemplate(request: SecuredRequest): string {
  return request.route?.path ?? request.path.split('?')[0] ?? '/';
}

export function actorForAudit(request: SecuredRequest): { id: string; roles: readonly string[] } {
  return request.security?.mode === 'oidc'
    ? { id: request.security.principal.id, roles: request.security.principal.roles }
    : { id: 'local-development', roles: [] };
}
