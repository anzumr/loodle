/**
 * /api/profile: the signed-in player's cloud save.
 *
 *   GET     → { enabled, profile }   (profile is null until the first save)
 *   PUT     → { enabled, profile }   body: { name, avatar, progress, wardrobe, challenges }
 *   DELETE  → { enabled, deleted }   removes the stored profile
 *
 * Signed-out players and servers without a database get `enabled: false` and keep
 * playing with on-device progress.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Account } from './auth';
import type { Store } from './db';

const MAX_BODY = 32_768;
/** Saves one account may make per minute. The game saves after matches and purchases, far below this. */
export const SAVES_PER_MINUTE = 30;

export function createProfiles(options: { store: Store | null; account: (r: IncomingMessage) => Account | null; origins: string[] }) {
  const { store, account, origins } = options;
  const saves = new Map<string, number[]>();
  const reply = (response: ServerResponse, status: number, data: object) => {
    response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(data));
  };

  return {
    async handle(request: IncomingMessage, response: ServerResponse): Promise<boolean> {
      if (request.url?.split('?')[0] !== '/api/profile') return false;
      const user = account(request);
      if (!store) return reply(response, 200, { enabled: false, profile: null }), true;
      if (!user) return reply(response, 401, { enabled: true, error: 'Sign in to use cloud saves.' }), true;
      const id = `google:${user.id}`;
      try {
        if (request.method === 'GET') return reply(response, 200, { enabled: true, profile: await store.get(id) }), true;
        if (request.method !== 'PUT' && request.method !== 'DELETE') return reply(response, 405, { error: 'Method not allowed' }), true;
        // Changes only from the game's own pages (the session cookie is also SameSite=Lax).
        if (!request.headers.origin || !origins.includes(request.headers.origin)) return reply(response, 403, { error: 'Forbidden' }), true;
        if (request.method === 'DELETE') return reply(response, 200, { enabled: true, deleted: await store.remove(id) }), true;

        const now = Date.now();
        const recent = (saves.get(id) ?? []).filter((t) => t > now - 60_000);
        if (recent.length >= SAVES_PER_MINUTE) return reply(response, 429, { error: 'Saving too often. Try again in a minute.' }), true;
        recent.push(now);
        saves.set(id, recent);

        if (!request.headers['content-type']?.startsWith('application/json')) return reply(response, 415, { error: 'Expected JSON' }), true;
        let body = '';
        for await (const chunk of request) {
          body += String(chunk);
          if (Buffer.byteLength(body) > MAX_BODY) return reply(response, 413, { error: 'Request too large' }), true;
        }
        return reply(response, 200, { enabled: true, profile: await store.save(id, JSON.parse(body)) }), true;
      } catch (err) {
        if (err instanceof SyntaxError) return reply(response, 400, { error: 'Invalid JSON' }), true;
        console.error(err);
        return reply(response, 503, { enabled: true, error: 'Cloud saves are unavailable right now.' }), true;
      }
    },
    /** Forget old rate-limit entries. */
    prune(now = Date.now()) {
      for (const [id, times] of saves) if (!times.some((t) => t > now - 60_000)) saves.delete(id);
    },
  };
}
