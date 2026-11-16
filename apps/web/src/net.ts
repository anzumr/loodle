/** Connection to the LOODL game server (private rooms). */
import type { GameEvent, MatchState, Seat } from '@loodl/rules';

export interface RoomView {
  code: string;
  variant: string;
  host: number;
  players: { name: string; seat: Seat | null; connected: boolean }[];
  match: MatchState | null;
}

export type ServerMessage = { t: 'room'; room: RoomView; you: number; events: GameEvent[] } | { t: 'error'; message: string };

const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string | undefined) || `ws://${location.hostname}:8787`;

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

/** Open a connection and send `first` as soon as it is ready. */
export function connect(first: object, onMessage: (m: ServerMessage) => void, onClose: () => void): Connection {
  const ws = new WebSocket(SERVER_URL);
  let closedByUs = false;
  ws.onopen = () => ws.send(JSON.stringify(first));
  ws.onmessage = (e) => onMessage(JSON.parse(String(e.data)) as ServerMessage);
  ws.onclose = () => !closedByUs && onClose();
  return {
    send: (message) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(message)),
    close: () => {
      closedByUs = true;
      ws.close();
    },
  };
}
