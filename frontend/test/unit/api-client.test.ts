import { describe, expect, test } from 'bun:test';
import { ApiClient, ApiError } from '../../src/app/api/api-client.js';

describe('local API client', () => {
  test('adds query parameters and sends JSON accept headers', async () => {
    let requestedUrl = '';
    let requestInit: RequestInit | undefined;
    const client = new ApiClient('http://127.0.0.1:3000/', async (input, init) => {
      requestedUrl = String(input); requestInit = init;
      return new Response(JSON.stringify({ items: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    await client.get('/beneficiaries', { query: 'id / 1', offset: 20, empty: '' });
    expect(new URL(requestedUrl).searchParams.get('query')).toBe('id / 1');
    expect(new URL(requestedUrl).searchParams.get('offset')).toBe('20');
    expect(new URL(requestedUrl).searchParams.has('empty')).toBe(false);
    expect((requestInit?.headers as Record<string, string>).Accept).toBe('application/json');
  });

  test('surfaces API error messages and blocks non-local API origins', async () => {
    const client = new ApiClient('http://localhost:3000', async () => new Response(JSON.stringify({ message: 'Invalid state' }), { status: 409 }));
    await expect(client.get('/payments')).rejects.toMatchObject({ status: 409, message: 'Invalid state' });
    expect(() => new ApiClient('https://finance.example.com')).toThrow(ApiError);
    expect(() => new ApiClient('http://192.168.1.2:3000')).toThrow('local');
  });

  test('reports an unavailable backend clearly', async () => {
    const client = new ApiClient('http://127.0.0.1:3000', async () => { throw new Error('connection refused'); });
    await expect(client.get('/dashboard/summary')).rejects.toThrow('API local');
  });

  test('preserves caller idempotency headers and reports structured validation responses', async () => {
    let captured: RequestInit | undefined;
    const client = new ApiClient('http://127.0.0.1:3000', async (_input, init) => {
      captured = init;
      return new Response(JSON.stringify({ id: 'payment-1', replayed: false }), { status: 200 });
    });
    await client.post('/obligations/obligation-1/payment-instructions', undefined, {
      'Idempotency-Scope': 'local-admin-ui',
      'Idempotency-Key': 'stable-key',
    });
    expect(captured?.headers).toEqual({
      Accept: 'application/json',
      'Idempotency-Scope': 'local-admin-ui',
      'Idempotency-Key': 'stable-key',
    });

    const invalid = new ApiClient('http://localhost:3000', async () => new Response(
      JSON.stringify({ statusCode: 400, code: 'INVALID_REQUEST', message: ['amount is invalid', 'currency is invalid'] }),
      { status: 400 },
    ));
    await expect(invalid.post('/dividends', { currency: 'BRL' })).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_REQUEST',
      message: 'amount is invalid currency is invalid',
    });
  });

  test('uses an injected external token provider without persisting or exposing the token', async () => {
    let capturedHeaders: HeadersInit | undefined;
    const client = new ApiClient('http://127.0.0.1:3000', async (_input, init) => {
      capturedHeaders = init?.headers;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }, { getAccessToken: async () => 'short-lived-test-token' });
    await client.get('/auth/session');
    expect((capturedHeaders as Record<string, string>).Authorization).toBe('Bearer short-lived-test-token');

    client.setAccessTokenProvider();
    await client.get('/auth/session');
    expect(capturedHeaders).not.toHaveProperty('Authorization');
  });

  test('handles empty success responses and malformed JSON without leaking fetch details', async () => {
    const noContent = new ApiClient('http://127.0.0.1:3000', async () => new Response(null, { status: 204 }));
    await expect(noContent.post('/resource')).resolves.toBeUndefined();
    const malformed = new ApiClient('http://127.0.0.1:3000', async () => new Response('not-json', { status: 200 }));
    await expect(malformed.get('/dashboard/summary')).rejects.toThrow('resposta inválida');
  });
});
