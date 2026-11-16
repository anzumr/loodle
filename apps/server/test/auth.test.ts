import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { OAuth2Client } from 'google-auth-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuth, issueSession, readSession } from '../src/auth';

const secret = 'test-secret-with-at-least-thirty-two-characters';
const options = { clientId: 'test.apps.googleusercontent.com', secret, secure: true, origins: ['https://loodle.online'] };
const csrf = 'test-nonce';
async function call(path: string, method = 'GET', body = '', headers: Record<string, string> = {}) {
  const request = Object.assign(Readable.from(body ? [body] : []), { url: path, method, headers }) as unknown as IncomingMessage;
  const result = { status: 0, headers: {} as Record<string, string | string[]>, body: '' };
  const response = {
    setHeader: (key: string, value: string | string[]) => { result.headers[key] = value; },
    writeHead: (status: number, values: Record<string, string>) => { result.status = status; Object.assign(result.headers, values); },
    end: (value = '') => { result.body = value; },
  } as unknown as ServerResponse;
  await createAuth(options).handle(request, response);
  return result;
}
const headers = { origin: 'https://loodle.online', cookie: `loodl_csrf=${csrf}`, 'x-csrf-token': csrf, 'content-type': 'application/json' };
afterEach(() => vi.restoreAllMocks());

describe('account sessions', () => {
  it('accepts signed sessions and rejects tampering, other secrets and expiry', () => {
    const user = { id: '123', name: 'Test Player' };
    const token = issueSession(user, secret, 1000);
    expect(readSession(token, secret, 2000)).toEqual(user);
    expect(readSession(token.replace(/.$/, '!'), secret, 2000)).toBeNull();
    expect(readSession(token, 'another-secret', 2000)).toBeNull();
    expect(readSession(token, secret, 1000 + 86_400_000)).toBeNull();
    expect(readSession('broken.é', secret)).toBeNull();
  });
  it('requires a strong configured secret, but permits guest-only hosting', () => {
    expect(() => createAuth({ ...options, secret: 'short' })).toThrow();
    expect(() => createAuth({ secure: false, origins: [] })).not.toThrow();
  });
  it('returns an uncached session and an HttpOnly CSRF challenge', async () => {
    const result = await call('/api/auth/session');
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({ user: null, clientId: options.clientId });
    expect(result.headers['Cache-Control']).toBe('no-store');
    expect(result.headers['Set-Cookie']).toContain('HttpOnly; SameSite=Lax');
  });
  it('verifies the Google audience and nonce before issuing a secure session', async () => {
    const verify = vi.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({ getPayload: () => ({ sub: 'google-user', name: 'Alex', nonce: csrf }) } as never);
    const result = await call('/api/auth/google', 'POST', JSON.stringify({ credential: 'google-id-token' }), headers);
    expect(verify).toHaveBeenCalledWith({ idToken: 'google-id-token', audience: options.clientId });
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body).user).toEqual({ id: 'google-user', name: 'Alex' });
    const cookie = (result.headers['Set-Cookie'] as string[])[0]!;
    expect(cookie).toContain('; Secure');
    expect(cookie).toContain('; HttpOnly');
    const token = cookie.split(';')[0]!.slice('loodl_session='.length);
    expect(readSession(token, secret)?.id).toBe('google-user');
  });
  it('rejects forged Google credentials and mismatched identity nonces', async () => {
    const verify = vi.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockRejectedValue(new Error('invalid'));
    expect((await call('/api/auth/google', 'POST', '{"credential":"forged"}', headers)).status).toBe(401);
    verify.mockResolvedValue({ getPayload: () => ({ sub: '123', nonce: 'wrong' }) } as never);
    expect((await call('/api/auth/google', 'POST', '{"credential":"token"}', headers)).status).toBe(401);
  });
  it('blocks cross-site requests and oversized payloads before verification', async () => {
    const verify = vi.spyOn(OAuth2Client.prototype, 'verifyIdToken');
    expect((await call('/api/auth/google', 'POST', '{}', { ...headers, origin: 'https://other.example' })).status).toBe(403);
    expect((await call('/api/auth/google', 'POST', '{}', { ...headers, 'x-csrf-token': 'wrong' })).status).toBe(403);
    expect((await call('/api/auth/google', 'POST', 'x'.repeat(17_000), headers)).status).toBe(413);
    expect(verify).not.toHaveBeenCalled();
  });
  it('clears the session on sign out', async () => {
    const result = await call('/api/auth/logout', 'POST', '', headers);
    expect(result.status).toBe(200);
    expect(result.headers['Set-Cookie']).toContain('Max-Age=0');
  });
});
