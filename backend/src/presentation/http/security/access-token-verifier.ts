import { createHash } from 'node:crypto';
import * as jose from 'jose';
import type { AdminRole } from './permissions.js';
import { parseRoleClaim, permissionsForRoles } from './permissions.js';
import type { OidcSecurityConfig } from './security-config.js';
import type { AuthenticatedPrincipal } from './security.types.js';

export interface AccessTokenVerifier {
  verify(token: string): Promise<AuthenticatedPrincipal>;
}

export const ACCESS_TOKEN_VERIFIER = Symbol('ACCESS_TOKEN_VERIFIER');
export const SECURITY_CONFIG = Symbol('SECURITY_CONFIG');
export const ADMIN_AUDIT_SINK = Symbol('ADMIN_AUDIT_SINK');

export class InvalidAccessTokenError extends Error {
  constructor(readonly reason: 'invalid' | 'expired' = 'invalid') {
    super('Access token was rejected.');
    this.name = 'InvalidAccessTokenError';
  }
}

export class IdentityProviderUnavailableError extends Error {
  constructor() {
    super('Identity provider key service is unavailable.');
    this.name = 'IdentityProviderUnavailableError';
  }
}

type JwksResolver = Parameters<typeof jose.jwtVerify>[1];

function isProviderAvailabilityError(error: unknown): boolean {
  const name = error instanceof Error ? error.name : '';
  if (error instanceof jose.errors.JWKSTimeout || error instanceof TypeError) return true;
  if (['FetchError', 'TimeoutError', 'AbortError'].includes(name)) return true;
  if (error instanceof jose.errors.JOSEError) {
    return !(error instanceof jose.errors.JWTExpired
      || error instanceof jose.errors.JWTClaimValidationFailed
      || error instanceof jose.errors.JWTInvalid
      || error instanceof jose.errors.JWSInvalid
      || error instanceof jose.errors.JOSEAlgNotAllowed
      || error instanceof jose.errors.JWSSignatureVerificationFailed
      || error instanceof jose.errors.JWKSNoMatchingKey
      || error instanceof jose.errors.JWKSMultipleMatchingKeys);
  }
  return false;
}

export class OidcAccessTokenVerifier implements AccessTokenVerifier {
  private readonly keyResolver: JwksResolver;

  constructor(
    private readonly config: OidcSecurityConfig,
    keyResolver?: JwksResolver,
  ) {
    this.keyResolver = keyResolver ?? jose.createRemoteJWKSet(new URL(config.jwksUri), {
      timeoutDuration: 5_000,
      cooldownDuration: 30_000,
      cacheMaxAge: 10 * 60_000,
    });
  }

  async verify(token: string): Promise<AuthenticatedPrincipal> {
    if (token.length > 8_192 || token.split('.').length !== 3) throw new InvalidAccessTokenError();

    let payload: jose.JWTPayload;
    try {
      ({ payload } = await jose.jwtVerify(token, this.keyResolver, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: ['RS256', 'ES256', 'PS256'],
        clockTolerance: 5,
      }));
    } catch (error) {
      if (error instanceof jose.errors.JWTExpired) throw new InvalidAccessTokenError('expired');
      if (isProviderAvailabilityError(error)) throw new IdentityProviderUnavailableError();
      throw new InvalidAccessTokenError();
    }

    if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)
      || typeof payload.sub !== 'string' || payload.sub.trim().length === 0) {
      throw new InvalidAccessTokenError();
    }
    const roles: AdminRole[] = parseRoleClaim(payload[this.config.roleClaim]);
    const id = createHash('sha256').update(`${this.config.issuer}\0${payload.sub}`).digest('hex');
    return {
      id,
      roles,
      permissions: permissionsForRoles(roles),
      idempotencyScope: `oidc:${id}`,
    };
  }
}

export class NoAccessTokenVerifier implements AccessTokenVerifier {
  async verify(): Promise<AuthenticatedPrincipal> {
    throw new InvalidAccessTokenError();
  }
}
