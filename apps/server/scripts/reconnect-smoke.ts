/// <reference lib="dom" />
/// <reference types="vite/client" />
/** Runs the browser reconnect controller against a real server; no browser rendering. */
import { WebSocket as NodeSocket } from 'ws';
import { legalMoves } from '@loodl/rules';
import { connect, type ConnectionStatus, type ServerMessage } from '../../web/src/net';

const url = process.env.SERVER_URL ?? 'ws://localhost:8787';
const sockets: NodeSocket[] = [];
class TrackedSocket extends NodeSocket {
  constructor(address: string) { super(address); sockets.push(this); }
}
globalThis.WebSocket = TrackedSocket as unknown as typeof globalThis.WebSocket;
const until = async (check: () => boolean, label: string) => {
  for (let i = 0; i < 800; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timeout: ${label}`);
};
type RoomMessage = Extract<ServerMessage, { t: 'room' }>;
const a = { room: null as RoomMessage | null, status: '' as ConnectionStatus | '' };
const b = { room: null as RoomMessage | null, status: '' as ConnectionStatus | '' };
const errors: string[] = [];
const receive = (client: typeof a) => (message: ServerMessage) => {
  if (message.t === 'error') errors.push(message.message);
  else client.room = message;
};
const first = connect({ t: 'create', variant: 'race', token: 'reconnect-smoke-aaaaaaaa', name: 'Alex' }, receive(a), (status) => { a.status = status; }, url);
let second: ReturnType<typeof connect> | undefined;
try {
  await until(() => !!a.room, 'create');
  second = connect({ t: 'join', code: a.room!.room.code, token: 'reconnect-smoke-bbbbbbbb', name: 'Emma' }, receive(b), (status) => { b.status = status; }, url);
  await until(() => a.room!.room.players.length === 2, 'join');
  first.send({ t: 'start' });
  await until(() => !!b.room?.room.match, 'start');
  const version = b.room!.room.match!.version;
  sockets[1]!.terminate();
  await until(() => b.status === 'reconnecting', 'automatic retry');
  await until(() => b.status === 'connected', 'automatic rejoin');
  if (b.room!.room.match!.version !== version || b.room!.room.players[b.room!.you]!.seat !== 2) throw new Error('Reconnect lost seat or state');
  let actions = 0;
  while (a.room!.room.match!.turn.phase !== 'over') {
    await new Promise((resolve) => setTimeout(resolve, 400)); // respect public-server message limits
    const match = a.room!.room.match!;
    const sender = match.turn.seat === 0 ? first : second;
    sender.send(match.turn.phase === 'roll' ? { t: 'roll' } : { t: 'move', pawn: legalMoves(match)[0]!.pawn });
    await until(() => a.room!.room.match!.version > match.version && b.room!.room.match!.version > match.version, 'action');
    if (++actions > 20_000) throw new Error('Match did not finish');
  }
  if (JSON.stringify(a.room!.room.match) !== JSON.stringify(b.room!.room.match) || errors.length) throw new Error(`Clients disagreed or received errors: ${errors}`);
  console.log(JSON.stringify({ automaticReconnect: true, seatPreserved: true, clientsAgree: true, actions }));
} finally {
  first.close(); second?.close();
}
