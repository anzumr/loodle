/** Production HTTP, origin checks and account identity over real local sockets. No live Google account required. */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { issueSession } from '../src/auth';

const port = process.env.SMOKE_PORT ?? '8792';
const base = `http://127.0.0.1:${port}`;
const origin = 'https://loodle.online';
const secret = randomBytes(32).toString('hex');
const root = fileURLToPath(new URL('../../../', import.meta.url));
const child = spawn(process.execPath, ['--import', 'tsx', 'apps/server/src/index.ts'], {
  cwd: root, stdio: ['ignore', 'ignore', 'inherit'],
  env: { ...process.env, NODE_ENV: 'production', PORT: port, PUBLIC_ORIGIN: origin, AUTH_SECRET: secret, GOOGLE_CLIENT_ID: '' },
});
const sockets: WebSocket[] = [];
const until = async (check: () => boolean | Promise<boolean>) => {
  for (let i = 0; i < 200; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Hosting smoke timed out');
};
function client(cookie?: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}) } });
  sockets.push(ws);
  const state = { last: null as { t: string; you: number; room: { code: string; players: { connected: boolean; seat: number | null }[]; match: { version: number } | null } } | null };
  ws.on('message', (data) => { state.last = JSON.parse(String(data)); });
  return { ws, state, send: (message: object) => ws.send(JSON.stringify(message)) };
}
try {
  await until(async () => { try { return (await fetch(`${base}/healthz`)).ok; } catch { return false; } });
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type')!, /text\/html/);
  const html = await page.text();
  const asset = html.match(/src="(\/assets\/[^" ]+\.js)"/)?.[1];
  assert.ok(asset);
  assert.equal((await fetch(`${base}${asset}`)).status, 200);
  assert.equal((await fetch(`${base}/.env`)).status, 404);
  const cookie = `loodl_session=${issueSession({ id: 'test-google-sub', name: 'Alex' }, secret)}`;
  const session = await fetch(`${base}/api/auth/session`, { headers: { Cookie: cookie } });
  assert.equal((await session.json() as { user: { name: string } }).user.name, 'Alex');
  assert.equal((await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: { Origin: 'https://wrong.example' } })).status, 403);
  await new Promise<void>((resolve, reject) => {
    const bad = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { Origin: 'https://wrong.example' } });
    sockets.push(bad);
    bad.on('open', () => reject(new Error('Cross-site socket accepted')));
    bad.on('unexpected-response', (_, response) => { try { assert.equal(response.statusCode, 403); bad.terminate(); resolve(); } catch (error) { reject(error); } });
    bad.on('error', () => {});
  });
  const a = client(cookie), b = client();
  await until(() => a.ws.readyState === 1 && b.ws.readyState === 1);
  a.send({ t: 'create', variant: 'race', token: 'first-browser-token', name: 'Alex' });
  await until(() => !!a.state.last);
  const code = a.state.last!.room.code;
  b.send({ t: 'join', code, token: 'guest-browser-token', name: 'Emma' });
  await until(() => a.state.last!.room.players.length === 2);
  a.send({ t: 'start' });
  await until(() => !!b.state.last?.room.match);
  a.ws.close();
  await until(() => !b.state.last!.room.players[0]!.connected);
  const next = client(cookie);
  await until(() => next.ws.readyState === 1);
  next.send({ t: 'join', code, token: 'different-browser-token', name: 'Alex' });
  await until(() => !!next.state.last);
  assert.equal(next.state.last!.you, 0);
  assert.equal(next.state.last!.room.players[0]!.seat, 0);
  assert.equal(next.state.last!.room.match!.version, 0);
  const impostor = client();
  await until(() => impostor.ws.readyState === 1);
  impostor.send({ t: 'join', code, token: 'google:test-google-sub', name: 'Alex' });
  await until(() => !!impostor.state.last);
  assert.equal(impostor.state.last!.t, 'error');
  const oversized = client();
  oversized.ws.on('error', () => {});
  await until(() => oversized.ws.readyState === 1);
  oversized.ws.send('x'.repeat(3000));
  await until(() => oversized.ws.readyState === 3);
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  console.log(JSON.stringify({ http: true, assets: true, originProtection: true, accountSeatRecovery: true }));
} finally {
  for (const ws of sockets) ws.terminate();
  child.kill('SIGTERM');
}
