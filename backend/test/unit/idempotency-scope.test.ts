import { describe, expect, test } from 'bun:test';
import { effectiveIdempotencyScope } from '../../src/presentation/http/security/idempotency-scope.js';

describe('authenticated idempotency scope', () => {
  test('derives scope from the verified identity instead of trusting the client header', () => {
    expect(effectiveIdempotencyScope({
      headers: {}, method: 'POST', path: '/obligations/1/payment-instructions', params: {},
      security: { mode: 'oidc', principal: { id: 'hashed-subject', roles: ['operator'], permissions: ['payments:request'], idempotencyScope: 'oidc:hashed-subject' } },
    }, 'another-users-scope')).toBe('oidc:hashed-subject');
    expect(() => effectiveIdempotencyScope({
      headers: {}, method: 'POST', path: '/obligations/1/payment-instructions', params: {},
      security: { mode: 'oidc', principal: { id: 'hashed-subject', roles: ['operator'], permissions: ['payments:request'], idempotencyScope: 'oidc:hashed-subject' } },
    }, undefined)).toThrow('Idempotency-Scope');
  });

  test('preserves the existing required scope contract in explicit local-development mode', () => {
    const request = { headers: {}, method: 'POST', path: '/', params: {}, security: { mode: 'local-development' as const } };
    expect(effectiveIdempotencyScope(request, 'local-admin-ui')).toBe('local-admin-ui');
    expect(() => effectiveIdempotencyScope(request, undefined)).toThrow('Idempotency-Scope');
  });
});
