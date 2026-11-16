import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { OAuth2Client } from 'google-auth-library';

export interface Account { id: string; name: string }
const MAX_AGE = 24 * 60 * 60;
const COOKIE = 'loodl_session';
const CSRF_COOKIE = 'loodl_csrf';

export function cookies(header = ''): Record<string, string> {
  return Object.fromEntries(header.split(';').map((part) => {
    const index = part.indexOf('=');
    return [part.slice(0, index).trim(), part.slice(index + 1)];
  }).filter(([key]) => key));
}
const equal = (a: string, b: string) => {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

export function issueSession(account: Account, secret: string, now = Date.now()): string {
  const data = Buffer.from(JSON.stringify({ ...account, expires: now + MAX_AGE * 1000 })).toString('base64url');
  return `${data}.${createHmac('sha256', secret).update(data).digest('base64url')}`;
}
export function readSession(token: string | undefined, secret: string, now = Date.now()): Account | null {
  if (!token || !secret || token.length > 2048) return null;
  const [data, signature] = token.split('.');
  if (!data || !signature || !equal(signature, createHmac('sha256', secret).update(data).digest('base64url'))) return null;
  try {
    const user = JSON.parse(Buffer.from(data, 'base64url').toString()) as Account & { expires: number };
    return typeof user.id === 'string' && typeof user.name === 'string' && user.expires > now ? { id: user.id, name: user.name } : null;
  } catch { return null; }
}

export function createAuth(options: { clientId?: string; secret?: string; secure: boolean; origins: string[] }) {
  const { clientId, secret = '', secure, origins } = options;
  if (clientId && secret.length < 32) throw new Error('GOOGLE_CLIENT_ID requires AUTH_SECRET with at least 32 characters');
  const google = new OAuth2Client(clientId);
  const cookie = (name: string, value: string, age: number) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? '; Secure' : ''}`;
  const account = (request: IncomingMessage) => readSession(cookies(request.headers.cookie)[COOKIE], secret);
  const reply = (response: ServerResponse, status: number, data: object) => {
    response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(data));
  };
  return {
    account,
    async handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
      const path = request.url?.split('?')[0];
      if (!path?.startsWith('/api/auth/')) return false;
      if (path === '/api/auth/session' && request.method === 'GET') {
        const csrf = randomBytes(32).toString('hex');
        response.setHeader('Set-Cookie', cookie(CSRF_COOKIE, csrf, 3600));
        reply(response, 200, { user: account(request), clientId: clientId ?? null, csrf });
        return true;
      }
      if (request.method !== 'POST' || !['/api/auth/google', '/api/auth/logout'].includes(path)) {
        reply(response, 404, { error: 'Not found' }); return true;
      }
      const csrf = request.headers['x-csrf-token'];
      const expected = cookies(request.headers.cookie)[CSRF_COOKIE];
      if (!request.headers.origin || !origins.includes(request.headers.origin) || typeof csrf !== 'string' || !expected || !equal(csrf, expected)) {
        reply(response, 403, { error: 'Refresh the sign-in panel and try again.' }); return true;
      }
      if (path === '/api/auth/logout') {
        response.setHeader('Set-Cookie', cookie(COOKIE, '', 0));
        reply(response, 200, { user: null }); return true;
      }
      if (!clientId) { reply(response, 503, { error: 'Google sign-in is not configured yet.' }); return true; }
      if (!request.headers['content-type']?.startsWith('application/json')) { reply(response, 415, { error: 'Expected JSON' }); return true; }
      try {
        let body = '';
        for await (const chunk of request) {
          body += String(chunk);
          if (Buffer.byteLength(body) > 16_384) { reply(response, 413, { error: 'Request too large' }); return true; }
        }
        const { credential } = JSON.parse(body) as { credential?: unknown };
        if (typeof credential !== 'string') throw new Error('Missing credential');
        const ticket = await google.verifyIdToken({ idToken: credential, audience: clientId });
        const profile = ticket.getPayload();
        if (!profile?.sub || (profile as typeof profile & { nonce?: string }).nonce !== csrf) throw new Error('Invalid identity nonce');
        const user = { id: profile.sub, name: (profile.name ?? 'Player').slice(0, 64) };
        response.setHeader('Set-Cookie', [cookie(COOKIE, issueSession(user, secret), MAX_AGE), cookie(CSRF_COOKIE, '', 0)]);
        reply(response, 200, { user });
      } catch {
        reply(response, 401, { error: 'Google sign-in could not be verified. Please try again.' });
      }
      return true;
    },
  };
}
