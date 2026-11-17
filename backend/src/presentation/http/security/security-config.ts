import { assertLoopbackHost } from '../local-network.js';

export interface OidcSecurityConfig {
  readonly mode: 'oidc';
  readonly issuer: string;
  readonly audience: string;
  readonly jwksUri: string;
  readonly roleClaim: string;
}

export interface LocalSecurityConfig {
  readonly mode: 'disabled';
}

export type SecurityConfig = OidcSecurityConfig | LocalSecurityConfig;

export class SecurityConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityConfigurationError';
  }
}

function requiredSetting(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new SecurityConfigurationError(`${name} is required when AUTH_MODE=oidc.`);
  return value;
}

function requireHttpsUrl(value: string, name: string): string {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new SecurityConfigurationError(`${name} must be a valid HTTPS URL.`); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new SecurityConfigurationError(`${name} must be an HTTPS URL without embedded credentials or fragments.`);
  }
  return value;
}

export function resolveSecurityConfig(env: NodeJS.ProcessEnv = process.env): SecurityConfig {
  // Neither auth mode may bind the application to a non-loopback interface in this stage.
  assertLoopbackHost(env.API_HOST ?? '127.0.0.1', 'API_HOST');
  const mode = env.AUTH_MODE?.trim();
  if (mode === 'disabled') {
    if (env.NODE_ENV === 'production') {
      throw new SecurityConfigurationError('AUTH_MODE=disabled is forbidden when NODE_ENV=production.');
    }
    return { mode: 'disabled' };
  }
  if (mode !== 'oidc') {
    throw new SecurityConfigurationError('AUTH_MODE must be explicitly set to oidc or disabled for loopback development.');
  }

  const issuer = requireHttpsUrl(requiredSetting(env, 'OIDC_ISSUER'), 'OIDC_ISSUER');
  const audience = requiredSetting(env, 'OIDC_AUDIENCE');
  const jwksUri = requireHttpsUrl(requiredSetting(env, 'OIDC_JWKS_URI'), 'OIDC_JWKS_URI');
  const roleClaim = env.OIDC_ROLE_CLAIM?.trim() || 'roles';
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(roleClaim)) {
    throw new SecurityConfigurationError('OIDC_ROLE_CLAIM must be a simple claim name.');
  }
  return { mode: 'oidc', issuer, audience, jwksUri, roleClaim };
}
