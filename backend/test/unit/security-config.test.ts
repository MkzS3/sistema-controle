import { describe, expect, test } from 'bun:test';
import { resolveSecurityConfig, SecurityConfigurationError } from '../../src/presentation/http/security/security-config.js';

function env(values: Record<string, string>): NodeJS.ProcessEnv {
  return values as NodeJS.ProcessEnv;
}

describe('administrative security configuration', () => {
  test('allows explicit authentication-disabled mode only for local development', () => {
    expect(resolveSecurityConfig(env({ AUTH_MODE: 'disabled', API_HOST: '127.0.0.1' }))).toEqual({ mode: 'disabled' });
    expect(() => resolveSecurityConfig(env({ AUTH_MODE: 'disabled', API_HOST: '0.0.0.0' }))).toThrow('local development');
    expect(() => resolveSecurityConfig(env({ AUTH_MODE: 'disabled', NODE_ENV: 'production' }))).toThrow('forbidden');
  });

  test('requires an explicit authentication mode and complete provider configuration', () => {
    expect(() => resolveSecurityConfig(env({}))).toThrow(SecurityConfigurationError);
    expect(() => resolveSecurityConfig(env({ AUTH_MODE: 'oidc' }))).toThrow('OIDC_ISSUER is required');
    expect(() => resolveSecurityConfig(env({ AUTH_MODE: 'oidc', OIDC_ISSUER: 'https://id.example', OIDC_AUDIENCE: 'api' }))).toThrow('OIDC_JWKS_URI is required');
  });

  test('accepts an HTTPS issuer and JWKS endpoint but rejects insecure or malformed endpoints', () => {
    expect(resolveSecurityConfig(env({
      AUTH_MODE: 'oidc', OIDC_ISSUER: 'https://identity.example/tenant',
      OIDC_AUDIENCE: 'dividend-api', OIDC_JWKS_URI: 'https://identity.example/keys',
    }))).toMatchObject({ mode: 'oidc', issuer: 'https://identity.example/tenant', audience: 'dividend-api' });
    expect(() => resolveSecurityConfig(env({
      AUTH_MODE: 'oidc', OIDC_ISSUER: 'http://identity.example',
      OIDC_AUDIENCE: 'api', OIDC_JWKS_URI: 'https://identity.example/keys',
    }))).toThrow('HTTPS');
    expect(() => resolveSecurityConfig(env({
      AUTH_MODE: 'oidc', OIDC_ISSUER: 'https://identity.example',
      OIDC_AUDIENCE: 'api', OIDC_JWKS_URI: 'https://identity.example/keys', OIDC_ROLE_CLAIM: 'roles.claim',
    }))).toThrow('simple claim name');
    expect(() => resolveSecurityConfig(env({
      AUTH_MODE: 'oidc', API_HOST: '0.0.0.0', OIDC_ISSUER: 'https://identity.example',
      OIDC_AUDIENCE: 'api', OIDC_JWKS_URI: 'https://identity.example/keys',
    }))).toThrow('local development');
  });
});
