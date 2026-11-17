import { describe, expect, test } from 'bun:test';
import * as jose from 'jose';
import { OidcAccessTokenVerifier, IdentityProviderUnavailableError, InvalidAccessTokenError } from '../../src/presentation/http/security/access-token-verifier.js';
import type { OidcSecurityConfig } from '../../src/presentation/http/security/security-config.js';

const config: OidcSecurityConfig = {
  mode: 'oidc', issuer: 'https://identity.example/tenant', audience: 'dividend-control-api',
  jwksUri: 'https://identity.example/keys', roleClaim: 'roles',
};

const keyPair = await jose.generateKeyPair('RS256');
const publicJwk = await jose.exportJWK(keyPair.publicKey);
Object.assign(publicJwk, { kid: 'stage10-test-key', alg: 'RS256', use: 'sig' });
const localJwks = jose.createLocalJWKSet({ keys: [publicJwk] });
const verifier = new OidcAccessTokenVerifier(config, localJwks);

async function signToken(options: {
  issuer?: string;
  audience?: string;
  subject?: string;
  roles?: unknown;
  expiration?: number | null;
} = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = { roles: options.roles ?? ['operator'] };
  let token = new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: 'stage10-test-key' })
    .setIssuer(options.issuer ?? config.issuer)
    .setAudience(options.audience ?? config.audience)
    .setSubject(options.subject ?? 'operator-identity')
    .setIssuedAt(now - 10);
  if (options.expiration !== null) token = token.setExpirationTime(options.expiration ?? now + 300);
  return token.sign(keyPair.privateKey);
}

describe('OIDC access token verification with a local test JWKS', () => {
  test('verifies signature, issuer, audience, expiry and maps only known roles', async () => {
    const token = await signToken({ roles: ['operator', 'made-up-role'] });
    const principal = await verifier.verify(token);
    expect(principal.roles).toEqual(['operator']);
    expect(principal.permissions).toContain('payments:request');
    expect(principal.idempotencyScope).toBe(`oidc:${principal.id}`);
    expect(principal.id).not.toContain('operator-identity');
  });

  test('rejects invalid signatures and claims with an opaque verification failure', async () => {
    const signed = await signToken();
    const [header, payload] = signed.split('.');
    await expect(verifier.verify(`${header}.${payload}.AAAA`)).rejects.toBeInstanceOf(InvalidAccessTokenError);
    await expect(verifier.verify(await signToken({ issuer: 'https://other.example' }))).rejects.toBeInstanceOf(InvalidAccessTokenError);
    await expect(verifier.verify(await signToken({ audience: 'another-api' }))).rejects.toBeInstanceOf(InvalidAccessTokenError);
  });

  test('rejects expired tokens and tokens without mandatory expiry or subject claims', async () => {
    const now = Math.floor(Date.now() / 1000);
    await expect(verifier.verify(await signToken({ expiration: now - 30 }))).rejects.toMatchObject({ reason: 'expired' });
    await expect(verifier.verify(await signToken({ expiration: null }))).rejects.toBeInstanceOf(InvalidAccessTokenError);
    await expect(verifier.verify(await signToken({ subject: '' }))).rejects.toBeInstanceOf(InvalidAccessTokenError);
  });

  test('reports JWKS network errors as provider outages instead of invalid user tokens', async () => {
    const unavailableKeys = new OidcAccessTokenVerifier(config, async () => { throw new TypeError('network failure'); });
    await expect(unavailableKeys.verify(await signToken())).rejects.toBeInstanceOf(IdentityProviderUnavailableError);
  });
});
