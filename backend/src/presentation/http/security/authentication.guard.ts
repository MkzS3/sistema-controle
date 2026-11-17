import {
  CanActivate,
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ACCESS_TOKEN_VERIFIER, IdentityProviderUnavailableError, InvalidAccessTokenError, SECURITY_CONFIG } from './access-token-verifier.js';
import { AdministrativeAuditLogger } from './administrative-audit.js';
import { AUDIT_ACTION, PUBLIC_ROUTE, REQUIRED_PERMISSION, type AuditActionDescriptor } from './security-metadata.js';
import { requestAuditId, routeTemplate } from './request-audit.js';
import type { Permission } from './permissions.js';
import type { AccessTokenVerifier } from './access-token-verifier.js';
import type { SecurityConfig } from './security-config.js';
import type { SecuredRequest } from './security.types.js';

function authFailure(status: number, code: string, message: string): UnauthorizedException {
  return new UnauthorizedException({ statusCode: status, code, message });
}

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(SECURITY_CONFIG) private readonly config: SecurityConfig,
    @Inject(ACCESS_TOKEN_VERIFIER) private readonly verifier: AccessTokenVerifier,
    private readonly audit: AdministrativeAuditLogger,
  ) {}

  async canActivate(context: import('@nestjs/common').ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<SecuredRequest>();
    const permission = this.reflector.getAllAndOverride<string>(REQUIRED_PERMISSION, [context.getHandler(), context.getClass()]);
    const action = this.reflector.getAllAndOverride<AuditActionDescriptor>(AUDIT_ACTION, [context.getHandler(), context.getClass()]);
    if (this.config.mode === 'disabled') {
      request.security = { mode: 'local-development' };
      return true;
    }

    const header = request.headers.authorization;
    const match = typeof header === 'string' ? /^Bearer ([^\s]+)$/.exec(header) : null;
    const token = match?.[1];
    if (!token || token.length > 8_192) {
      this.recordAuthenticationDenial(request, 'missing_or_malformed_bearer_token', action, permission);
      throw authFailure(401, 'AUTHENTICATION_REQUIRED', 'A valid Bearer access token is required.');
    }

    try {
      const principal = await this.verifier.verify(token);
      request.security = { mode: 'oidc', principal };
      return true;
    } catch (error) {
      if (error instanceof IdentityProviderUnavailableError) {
        this.recordAuthenticationDenial(request, 'identity_provider_unavailable', action, permission);
        throw new ServiceUnavailableException({ statusCode: 503, code: 'IDENTITY_PROVIDER_UNAVAILABLE', message: 'Identity provider verification is temporarily unavailable.' });
      }
      const reason = error instanceof InvalidAccessTokenError ? error.reason : 'invalid';
      this.recordAuthenticationDenial(request, reason === 'expired' ? 'expired_access_token' : 'invalid_access_token', action, permission);
      throw authFailure(401, reason === 'expired' ? 'ACCESS_TOKEN_EXPIRED' : 'INVALID_ACCESS_TOKEN', 'The access token is invalid or expired.');
    }
  }

  private recordAuthenticationDenial(request: SecuredRequest, reason: string, action?: AuditActionDescriptor, permission?: string): void {
    this.audit.write({
      event: 'security.authentication_denied', requestId: requestAuditId(request), actorId: 'unknown', roles: [],
      action: action?.action ?? `${request.method.toLowerCase()}.request`, resource: action?.resource ?? routeTemplate(request), outcome: 'denied', reason,
      ...(permission ? { permission } : {}),
      httpStatus: reason === 'identity_provider_unavailable' ? 503 : 401, route: routeTemplate(request), method: request.method,
    });
  }
}

@Injectable()
export class AuthorizationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(SECURITY_CONFIG) private readonly config: SecurityConfig,
    private readonly audit: AdministrativeAuditLogger,
  ) {}

  canActivate(context: import('@nestjs/common').ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_ROUTE, [context.getHandler(), context.getClass()]);
    if (isPublic || this.config.mode === 'disabled') return true;

    const request = context.switchToHttp().getRequest<SecuredRequest>();
    const permission = this.reflector.getAllAndOverride<string>(REQUIRED_PERMISSION, [context.getHandler(), context.getClass()]);
    const action = this.reflector.getAllAndOverride<AuditActionDescriptor>(AUDIT_ACTION, [context.getHandler(), context.getClass()]);
    const principal = request.security?.mode === 'oidc' ? request.security.principal : undefined;
    const permitted = !!permission && !!principal?.permissions.includes(permission as Permission);
    if (permitted) return true;

    const actor = principal ? { id: principal.id, roles: principal.roles } : { id: 'unknown', roles: [] };
    const status = principal ? 403 : 401;
    this.audit.write({
      event: 'security.authorization_denied', requestId: requestAuditId(request), actorId: actor.id, roles: actor.roles,
      action: action?.action ?? `${request.method.toLowerCase()}.request`, resource: action?.resource ?? routeTemplate(request), outcome: 'denied', reason: permission ? 'insufficient_permission' : 'permission_not_configured',
      ...(permission ? { permission } : {}), httpStatus: status, route: routeTemplate(request), method: request.method,
    });
    if (!principal) throw authFailure(401, 'AUTHENTICATION_REQUIRED', 'A valid Bearer access token is required.');
    throw new ForbiddenException({ statusCode: 403, code: 'INSUFFICIENT_PERMISSION', message: 'The identity does not have permission for this operation.' });
  }
}
