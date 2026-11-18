import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createStore, type Sql } from '../src/db';
import { createProfiles, SAVES_PER_MINUTE } from '../src/profile';

const ORIGIN = 'https://loodle.online';
let server: Server | null = null;

/** A server where the `x-test-user` header stands in for a signed-in session. */
async function start(withDatabase = true) {
  let store = null;
  if (withDatabase) {
    store = createStore(new PGlite() as unknown as Sql);
    await store.migrate();
  }
  const profiles = createProfiles({
    store,
    account: (r) => (typeof r.headers['x-test-user'] === 'string' ? { id: r.headers['x-test-user'], name: 'Test' } : null),
    origins: [ORIGIN],
  });
  server = createServer((req, res) => void profiles.handle(req, res).then((handled) => handled || (res.writeHead(404), res.end())));
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/profile`;
  const call = (method: string, user?: string, body?: unknown, origin: string | null = ORIGIN) =>
    fetch(base, {
      method,
      headers: { ...(user ? { 'x-test-user': user } : {}), ...(origin ? { origin } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
  return call;
}

afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())));

describe('/api/profile', () => {
  it('says cloud saves are off when the server has no database', async () => {
    const call = await start(false);
    expect(await (await call('GET', 'u1')).json()).toEqual({ enabled: false, profile: null });
  });

  it('needs a signed-in player', async () => {
    const call = await start();
    expect((await call('GET')).status).toBe(401);
    expect((await call('PUT', undefined, { name: 'Alpha' })).status).toBe(401);
  });

  it('saves, loads and deletes the signed-in player’s own profile', async () => {
    const call = await start();
    expect(await (await call('GET', 'u1')).json()).toEqual({ enabled: true, profile: null });
    const saved = await (await call('PUT', 'u1', { name: 'Krazer', progress: { xp: 10, coins: 5 } })).json();
    expect(saved.profile).toMatchObject({ name: 'Krazer', progress: { xp: 10, coins: 5 } });
    expect((await (await call('GET', 'u1')).json()).profile.name).toBe('Krazer');
    expect((await (await call('GET', 'u2')).json()).profile).toBeNull();
    expect(await (await call('DELETE', 'u1')).json()).toEqual({ enabled: true, deleted: true });
    expect((await (await call('GET', 'u1')).json()).profile).toBeNull();
  });

  it('refuses changes from other sites or without an origin', async () => {
    const call = await start();
    expect((await call('PUT', 'u1', { name: 'Alpha' }, 'https://evil.example')).status).toBe(403);
    expect((await call('PUT', 'u1', { name: 'Alpha' }, null)).status).toBe(403);
    expect((await call('DELETE', 'u1', undefined, 'https://evil.example')).status).toBe(403);
  });

  it('rejects bad bodies and limits how often one player saves', async () => {
    const call = await start();
    expect((await call('PUT', 'u1', '{not json')).status).toBe(400);
    expect((await call('PUT', 'u1', 'x'.repeat(40_000))).status).toBe(413);
    for (let i = 2; i < SAVES_PER_MINUTE; i++) expect((await call('PUT', 'u1', { name: 'Alpha' })).status).toBe(200);
    expect((await call('PUT', 'u1', { name: 'Alpha' })).status).toBe(429);
    expect((await call('PUT', 'u2', { name: 'Bravo' })).status).toBe(200);
  });
});
