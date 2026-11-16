/** Connection to the LOODL game server (private rooms). */
import type { GameEvent, MatchState, Seat } from '@loodl/rules';

export interface RoomView {
  code: string;
  variant: string;
  host: number;
  players: { name: string; avatar: number; seat: Seat | null; connected: boolean; bot: boolean }[];
  match: MatchState | null;
  actionDeadline: number | null;
  public: boolean;
  startsAt: number | null;
}

export type ServerMessage = { t: 'room'; room: RoomView; you: number; events: GameEvent[] } | { t: 'error'; message: string };

const serverUrl = () => (import.meta.env.VITE_SERVER_URL as string | undefined) || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;

const roomKey = () => `loodl.room${new URLSearchParams(location.search).get('p') ?? ''}`;
export function rememberedRoom(): string | null {
  try { return localStorage.getItem(roomKey()); } catch { return null; }
}
export function rememberRoom(code: string | null) {
  try {
    if (code) localStorage.setItem(roomKey(), code);
    else localStorage.removeItem(roomKey());
  } catch { /* Reconnect still works in memory when storage is unavailable. */ }
}

/**
 * A secret that identifies this browser to the server so a dropped connection
 * can reclaim its seat. `?p=name` in the address gives a separate identity,
 * which lets one machine open several players for testing.
 */
export function playerToken(): string {
  const key = `loodl.token${new URLSearchParams(location.search).get('p') ?? ''}`;
  const fresh = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  try {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const token = fresh();
    localStorage.setItem(key, token);
    return token;
  } catch {
    return fresh();
  }
}

export interface Connection {
  send(message: object): void;
  close(): void;
}

export type ConnectionStatus = 'connecting' | 'reconnecting' | 'connected' | 'failed';
type Identity = { token: string; name: string; avatar?: number };
export type Entry = ({ t: 'create' | 'quick'; variant: string } | { t: 'join'; code: string }) & Identity;

/** Rejoin with the same identity, never replaying a roll or move after a drop. */
export function connect(first: Entry, onMessage: (m: ServerMessage) => void, onStatus: (status: ConnectionStatus) => void, url = serverUrl()): Connection {
  let ws: WebSocket | null = null;
  let stopped = false;
  let ready = false;
  let attempts = 0;
  let entry = first;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;

  const stop = () => {
    stopped = true;
    ready = false;
    clearTimeout(retry);
    clearTimeout(deadline);
    ws?.close();
  };
  const schedule = () => {
    if (stopped) return;
    ready = false;
    clearTimeout(deadline);
    onStatus('reconnecting');
    retry = setTimeout(open, Math.min(1000 * 2 ** Math.min(attempts++, 4), 10_000));
  };
  const open = () => {
    if (stopped) return;
    let socket: WebSocket;
    try { socket = new WebSocket(url); } catch { schedule(); return; }
    ws = socket;
    // Ignore late callbacks from superseded sockets, including the handshake timeout.
    const current = () => !stopped && ws === socket;
    deadline = setTimeout(() => {
      if (!current() || ready) return;
      ws = null;
      socket.close();
      schedule();
    }, 10_000);
    socket.onopen = () => { if (current()) socket.send(JSON.stringify(entry)); };
    socket.onmessage = (event) => {
      if (!current()) return;
      let message: ServerMessage;
      try { message = JSON.parse(String(event.data)) as ServerMessage; } catch { return; }
      if (message.t === 'room') {
        entry = { t: 'join', code: message.room.code, token: first.token, name: first.name, avatar: first.avatar };
        rememberRoom(message.room.code);
        ready = true;
        attempts = 0;
        clearTimeout(deadline);
        onStatus('connected');
      } else if (message.t === 'error' && !ready) {
        stop();
        rememberRoom(null);
        onStatus('failed');
      }
      onMessage(message);
    };
    socket.onclose = () => { if (current()) { ws = null; schedule(); } };
    socket.onerror = () => { /* close or the handshake deadline triggers retry */ };
  };
  onStatus('connecting');
  open();
  return {
    send: (message) => { if (ready && ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message)); },
    close: stop,
  };
}
