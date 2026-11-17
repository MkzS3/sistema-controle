import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Body, Controller, Get, Module, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ACCESS_TOKEN_VERIFIER, ADMIN_AUDIT_SINK, SECURITY_CONFIG, InvalidAccessTokenError, IdentityProviderUnavailableError } from '../../src/presentation/http/security/access-token-verifier.js';
import { AuthSessionController } from '../../src/presentation/http/security/auth-session.controller.js';
import { BeneficiariesController } from '../../src/presentation/http/financial/beneficiaries.controller.js';
import { DividendsController } from '../../src/presentation/http/financial/dividends.controller.js';
import { ObligationsController } from '../../src/presentation/http/financial/obligations.controller.js';
import { PaymentInstructionsController } from '../../src/presentation/http/financial/payment-instructions.controller.js';
import { PaymentsController } from '../../src/presentation/http/financial/payments.controller.js';
import { LedgerController } from '../../src/presentation/http/financial/ledger.controller.js';
import { DashboardController } from '../../src/presentation/http/financial/dashboard.controller.js';
import { MetricsController } from '../../src/presentation/http/metrics.controller.js';
import { HealthController } from '../../src/presentation/http/health/health.controller.js';
import { AdministrativeAuditInterceptor } from '../../src/presentation/http/security/administrative-audit.interceptor.js';
import { AdministrativeAuditLogger, type AdministrativeAuditRecord } from '../../src/presentation/http/security/administrative-audit.js';
import { AuthenticationGuard, AuthorizationGuard } from '../../src/presentation/http/security/authentication.guard.js';
import { permissionsForRoles, type AdminRole } from '../../src/presentation/http/security/permissions.js';
import { AUDIT_ACTION, AuditAction, PUBLIC_ROUTE, PublicRoute, REQUIRED_PERMISSION, RequirePermission } from '../../src/presentation/http/security/security-metadata.js';
import type { AccessTokenVerifier } from '../../src/presentation/http/security/access-token-verifier.js';
import type { OidcSecurityConfig } from '../../src/presentation/http/security/security-config.js';
import type { AuthenticatedPrincipal } from '../../src/presentation/http/security/security.types.js';

const oidcConfig: OidcSecurityConfig = {
  mode: 'oidc', issuer: 'https://identity.example/tenant', audience: 'dividend-control-api',
  jwksUri: 'https://identity.example/keys', roleClaim: 'roles',
};
const auditRecords: AdministrativeAuditRecord[] = [];

function principal(role: AdminRole): AuthenticatedPrincipal {
  return { id: `subject-hash-${role}`, roles: [role], permissions: permissionsForRoles([role]), idempotencyScope: `oidc:subject-hash-${role}` };
}

class ControlledVerifier implements AccessTokenVerifier {
  async verify(token: string): Promise<AuthenticatedPrincipal> {
    if (token === 'admin-token') return principal('administrator');
    if (token === 'operator-token') return principal('operator');
    if (token === 'auditor-token') return principal('auditor');
    if (token === 'viewer-token') return principal('viewer');
    if (token === 'expired-token') throw new InvalidAccessTokenError('expired');
    if (token === 'provider-down-token') throw new IdentityProviderUnavailableError();
    throw new InvalidAccessTokenError();
  }
}

@Controller('security-test')
class SecurityTestController {
  @Get('live')
  @PublicRoute()
  live() { return { status: 'ok' }; }

  @Get('dashboard')
  @RequirePermission('dashboard:read')
  dashboard() { return { ok: true }; }

  @Get('unmarked')
  unmarked() { return { unexpected: true }; }

  @Post('beneficiaries')
  @RequirePermission('beneficiaries:create')
  @AuditAction('beneficiary.create', 'beneficiary')
  createBeneficiary(@Body() _body: unknown) { return { id: 'beneficiary-contract-id' }; }
}

@Module({
  controllers: [SecurityTestController, AuthSessionController],
  providers: [
    { provide: SECURITY_CONFIG, useValue: oidcConfig },
    { provide: ACCESS_TOKEN_VERIFIER, useValue: new ControlledVerifier() },
    { provide: ADMIN_AUDIT_SINK, useValue: (record: AdministrativeAuditRecord) => { auditRecords.push(record); } },
    AdministrativeAuditLogger,
    AuthenticationGuard,
    AuthorizationGuard,
    AdministrativeAuditInterceptor,
  ],
})
class SecurityContractTestModule {}

let app: Awaited<ReturnType<typeof NestFactory.create>>;
let baseUrl = '';

function auth(token?: string): HeadersInit | undefined {
  return token ? { Authorization: `Bearer ${token}` } : undefined;
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(new URL(path, baseUrl), init);
}

beforeAll(async () => {
  auditRecords.length = 0;
  app = await NestFactory.create(SecurityContractTestModule, { logger: false });
  app.useGlobalGuards(app.get(AuthenticationGuard), app.get(AuthorizationGuard));
  app.useGlobalInterceptors(app.get(AdministrativeAuditInterceptor));
  await app.listen(0, '127.0.0.1');
  baseUrl = await app.getUrl();
});

afterAll(async () => { await app?.close(); });

describe('HTTP authentication, authorization and administrative audit contracts', () => {
  test('every current financial, session and metrics handler has explicit permission metadata; health is public', () => {
    const securedHandlers: Array<[object, string, string]> = [
      [BeneficiariesController.prototype, 'create', 'beneficiaries:create'],
      [BeneficiariesController.prototype, 'list', 'beneficiaries:read'],
      [BeneficiariesController.prototype, 'get', 'beneficiaries:read'],
      [DividendsController.prototype, 'list', 'dividends:read'],
      [DividendsController.prototype, 'create', 'dividends:create'],
      [DividendsController.prototype, 'get', 'dividends:read'],
      [DividendsController.prototype, 'declare', 'dividends:declare'],
      [DividendsController.prototype, 'createObligation', 'obligations:create'],
      [ObligationsController.prototype, 'list', 'obligations:read'],
      [ObligationsController.prototype, 'get', 'obligations:read'],
      [PaymentInstructionsController.prototype, 'request', 'payments:request'],
      [PaymentsController.prototype, 'list', 'payments:read'],
      [PaymentsController.prototype, 'get', 'payments:read'],
      [LedgerController.prototype, 'list', 'ledger:read'],
      [LedgerController.prototype, 'get', 'ledger:read'],
      [DashboardController.prototype, 'summary', 'dashboard:read'],
      [MetricsController.prototype, 'getMetrics', 'system:metrics:read'],
      [AuthSessionController.prototype, 'session', 'session:read'],
    ];
    for (const [prototype, method, permission] of securedHandlers) {
      const handler = (prototype as Record<string, unknown>)[method] as object;
      expect(Reflect.getMetadata(REQUIRED_PERMISSION, handler)).toBe(permission);
    }
    expect(Reflect.getMetadata(PUBLIC_ROUTE, HealthController)).toBe(true);
    const auditedHandlers: Array<[object, string]> = [
      [BeneficiariesController.prototype, 'create'], [DividendsController.prototype, 'create'],
      [DividendsController.prototype, 'declare'], [DividendsController.prototype, 'createObligation'],
      [PaymentInstructionsController.prototype, 'request'],
    ];
    for (const [prototype, method] of auditedHandlers) {
      expect(Reflect.getMetadata(AUDIT_ACTION, (prototype as Record<string, unknown>)[method] as object)).toBeDefined();
    }
  });

  test('keeps liveness public but requires authentication on administrative reads', async () => {
    expect((await request('/security-test/live')).status).toBe(200);
    const response = await request('/security-test/dashboard');
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
  });

  test('returns 401 for invalid or expired tokens and 503 when identity keys are unavailable', async () => {
    const invalid = await request('/security-test/dashboard', { headers: auth('invalid-token') });
    expect(invalid.status).toBe(401);
    expect(await invalid.json()).toMatchObject({ code: 'INVALID_ACCESS_TOKEN' });

    const expired = await request('/security-test/dashboard', { headers: auth('expired-token') });
    expect(expired.status).toBe(401);
    expect(await expired.json()).toMatchObject({ code: 'ACCESS_TOKEN_EXPIRED' });

    const unavailable = await request('/security-test/dashboard', { headers: auth('provider-down-token') });
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toMatchObject({ code: 'IDENTITY_PROVIDER_UNAVAILABLE' });
  });

  test('allows the required permission and denies users without it', async () => {
    expect((await request('/security-test/dashboard', { headers: auth('viewer-token') })).status).toBe(200);
    const denied = await request('/security-test/beneficiaries', {
      method: 'POST', headers: { ...auth('auditor-token'), 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'private test value' }),
    });
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ code: 'INSUFFICIENT_PERMISSION' });
  });

  test('denies protected handlers with no permission metadata by default', async () => {
    const denied = await request('/security-test/unmarked', { headers: auth('admin-token') });
    expect(denied.status).toBe(403);
  });

  test('returns only validated roles and permissions from the authenticated session endpoint', async () => {
    const anonymous = await request('/auth/session');
    expect(anonymous.status).toBe(401);
    const session = await request('/auth/session', { headers: auth('auditor-token') });
    expect(session.status).toBe(200);
    expect(await session.json()).toMatchObject({ mode: 'oidc', authenticated: true, roles: ['auditor'], permissions: expect.arrayContaining(['audit:read', 'ledger:read']) });
  });

  test('logs action outcomes without request bodies or bearer tokens', async () => {
    auditRecords.length = 0;
    const denied = await request('/security-test/beneficiaries', {
      method: 'POST', headers: { ...auth('auditor-token'), 'Content-Type': 'application/json' }, body: JSON.stringify({ privateField: 'denied-secret@example.invalid' }),
    });
    expect(denied.status).toBe(403);
    const token = 'operator-token';
    const response = await request('/security-test/beneficiaries', {
      method: 'POST', headers: { ...auth(token), 'Content-Type': 'application/json' }, body: JSON.stringify({ privateField: 'do-not-log@example.invalid' }),
    });
    expect(response.status).toBe(201);
    const records = auditRecords.filter((record) => record.action === 'beneficiary.create');
    expect(records.map((record) => record.outcome)).toEqual(['denied', 'started', 'succeeded']);
    expect(records[2]).toMatchObject({ actorId: 'subject-hash-operator', resourceId: 'beneficiary-contract-id', roles: ['operator'] });
    const serialized = JSON.stringify(auditRecords);
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain('do-not-log@example.invalid');
    expect(serialized).not.toContain('denied-secret@example.invalid');
    expect(auditRecords.some((record) => record.event === 'security.authorization_denied' && record.permission === 'beneficiaries:create')).toBe(true);
  });
});
