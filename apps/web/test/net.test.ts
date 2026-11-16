import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connect, rememberedRoom, rememberRoom, type Connection, type ServerMessage } from '../src/net';

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 0;
  sent: object[] = [];
  onopen = () => {};
  onclose = () => {};
  onmessage = (_: { data: string }) => {};
  constructor(readonly url: string) { Socket.instances.push(this); }
  send(data: string) { this.sent.push(JSON.parse(data)); }
  open() { this.readyState = 1; this.onopen(); }
  close() { this.readyState = 3; this.onclose(); }
  receive(message: object) { this.onmessage({ data: JSON.stringify(message) }); }
}
const first = { t: 'create', token: 'secret-token-for-tests', name: 'Alex', variant: 'race' } as const;
const room = { t: 'room', room: { code: 'ABCDE', players: [], match: null, actionDeadline: null, host: 0, variant: 'race' }, you: 0, events: [] } satisfies ServerMessage;
const latest = () => Socket.instances[Socket.instances.length - 1]!;
let connection: Connection;

beforeEach(() => {
  vi.useFakeTimers();
  Socket.instances = [];
  const storage = new Map<string, string>();
  vi.stubGlobal('WebSocket', Socket);
  vi.stubGlobal('location', { hostname: 'localhost', host: 'localhost:5173', protocol: 'http:', search: '' });
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
});
afterEach(() => { connection?.close(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('automatic reconnect', () => {
  it('rejoins the room with the same token and waits for state without replaying moves', () => {
    const status = vi.fn();
    const receive = vi.fn();
    connection = connect(first, receive, status);
    const old = latest();
    old.open();
    expect(old.sent).toEqual([first]);
    old.receive(room);
    expect(rememberedRoom()).toBe('ABCDE');
    connection.send({ t: 'roll' });
    old.close();
    connection.send({ t: 'move', pawn: 0 });
    expect(status).toHaveBeenLastCalledWith('reconnecting');
    vi.advanceTimersByTime(1000);
    const next = latest();
    next.open();
    connection.send({ t: 'roll' });
    expect(next.sent).toEqual([{ t: 'join', code: 'ABCDE', token: first.token, name: first.name }]);
    old.receive({ t: 'error', message: 'stale' });
    expect(receive).toHaveBeenCalledTimes(1);
    next.receive(room);
    expect(status).toHaveBeenLastCalledWith('connected');
    connection.send({ t: 'roll' });
    expect(next.sent).toHaveLength(2);
  });

  it('backs off failed attempts and cancels pending retries on explicit close', () => {
    connection = connect(first, vi.fn(), vi.fn());
    latest().close();
    vi.advanceTimersByTime(999);
    expect(Socket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1);
    latest().close();
    vi.advanceTimersByTime(1999);
    expect(Socket.instances).toHaveLength(2);
    connection.close();
    vi.advanceTimersByTime(60_000);
    expect(Socket.instances).toHaveLength(2);
  });

  it('retries a connection that never completes its handshake', () => {
    connection = connect(first, vi.fn(), vi.fn());
    latest().open();
    vi.advanceTimersByTime(11_000);
    expect(Socket.instances).toHaveLength(2);
    expect(Socket.instances[0]!.readyState).toBe(3);
  });

  it('stops retrying when the room is gone and clears its remembered code', () => {
    rememberRoom('ABCDE');
    const status = vi.fn();
    const receive = vi.fn();
    connection = connect({ t: 'join', code: 'ABCDE', token: first.token, name: first.name }, receive, status);
    latest().open();
    latest().receive({ t: 'error', message: 'No room with that code' });
    expect(status).toHaveBeenLastCalledWith('failed');
    expect(receive).toHaveBeenCalledWith({ t: 'error', message: 'No room with that code' });
    expect(rememberedRoom()).toBeNull();
    vi.advanceTimersByTime(60_000);
    expect(Socket.instances).toHaveLength(1);
  });

  it('keeps a live room after an ordinary invalid action', () => {
    const status = vi.fn();
    connection = connect(first, vi.fn(), status);
    latest().open(); latest().receive(room);
    latest().receive({ t: 'error', message: 'It is not your turn' });
    expect(status).toHaveBeenLastCalledWith('connected');
    expect(rememberedRoom()).toBe('ABCDE');
  });

  it('separates test identities and chooses secure sockets for HTTPS', () => {
    rememberRoom('ABCDE');
    vi.stubGlobal('location', { hostname: 'example.com', host: 'example.com', protocol: 'https:', search: '?p=b' });
    expect(rememberedRoom()).toBeNull();
    connection = connect(first, vi.fn(), vi.fn());
    expect(latest().url).toBe('wss://example.com/ws');
  });
});
