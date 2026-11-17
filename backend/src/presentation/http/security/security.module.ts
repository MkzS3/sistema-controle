import { Global, Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { OidcAccessTokenVerifier, NoAccessTokenVerifier, ACCESS_TOKEN_VERIFIER, SECURITY_CONFIG, ADMIN_AUDIT_SINK } from './access-token-verifier.js';
import { AdministrativeAuditInterceptor } from './administrative-audit.interceptor.js';
import { AdministrativeAuditLogger, stdoutAuditSink } from './administrative-audit.js';
import { AuthenticationGuard, AuthorizationGuard } from './authentication.guard.js';
import { resolveSecurityConfig } from './security-config.js';
import type { SecurityConfig } from './security-config.js';

@Global()
@Module({
  providers: [
    { provide: SECURITY_CONFIG, useFactory: (): SecurityConfig => resolveSecurityConfig() },
    { provide: ACCESS_TOKEN_VERIFIER, inject: [SECURITY_CONFIG], useFactory: (config: SecurityConfig) =>
      config.mode === 'oidc' ? new OidcAccessTokenVerifier(config) : new NoAccessTokenVerifier() },
    { provide: ADMIN_AUDIT_SINK, useValue: stdoutAuditSink },
    AdministrativeAuditLogger,
    AuthenticationGuard,
    AuthorizationGuard,
    AdministrativeAuditInterceptor,
    { provide: APP_GUARD, useExisting: AuthenticationGuard },
    { provide: APP_GUARD, useExisting: AuthorizationGuard },
    { provide: APP_INTERCEPTOR, useExisting: AdministrativeAuditInterceptor },
  ],
  exports: [SECURITY_CONFIG, ACCESS_TOKEN_VERIFIER, ADMIN_AUDIT_SINK, AdministrativeAuditLogger],
})
export class SecurityModule {}
