/**
 * LOODL game server: private rooms over WebSocket.
 *
 * Messages are small JSON objects. After every change the server sends each
 * player in the room the full room view, which keeps clients simple and makes
 * reconnecting trivial: rejoin with the same token and you get the current state.
 *
 * Client → server:  create {token,name,variant} | join {token,name,code} | start | roll | move {pawn} | leave
 * Server → client:  room {room, you, events} | error {message}
 */
import { randomInt } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { RuleError, type Dice } from '@loodl/rules';
import { Room, RoomError, VARIANTS, type Variant } from './room';

const PORT = Number(process.env.PORT ?? 8787);
const ROOM_IDLE_MS = 30 * 60 * 1000;
const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no look-alikes (0/O, 1/I/L)

const dice: Dice = { roll: () => randomInt(1, 7) };
const rooms = new Map<string, Room>();
const sockets = new Map<WebSocket, { room: Room; token: string }>();

function newCode(): string {
  for (;;) {
    const code = Array.from({ length: 5 }, () => CODE_LETTERS[randomInt(CODE_LETTERS.length)]).join('');
    if (!rooms.has(code)) return code;
  }
}

function broadcast(room: Room, events: unknown[] = []) {
  const view = room.view();
  for (const [socket, session] of sockets)
    if (session.room === room) socket.send(JSON.stringify({ t: 'room', room: view, you: room.indexOf(session.token), events }));
}

function leave(socket: WebSocket) {
  const session = sockets.get(socket);
  if (!session) return;
  sockets.delete(socket);
  // Only mark them gone if they have not already reconnected on another socket.
  if (![...sockets.values()].some((s) => s.room === session.room && s.token === session.token)) session.room.disconnect(session.token);
  if (session.room.empty && !session.room.view().match) rooms.delete(session.room.code);
  else broadcast(session.room);
}

function handle(socket: WebSocket, msg: Record<string, unknown>) {
  const session = sockets.get(socket);
  if (msg.t === 'create' || msg.t === 'join') {
    if (typeof msg.token !== 'string' || msg.token.length < 16 || msg.token.length > 64) throw new RoomError('Invalid player token');
    let room: Room | undefined;
    if (msg.t === 'create') {
      const variant = (typeof msg.variant === 'string' && msg.variant in VARIANTS ? msg.variant : 'classic') as Variant;
      room = new Room(newCode(), variant, dice);
      rooms.set(room.code, room);
    } else {
      room = rooms.get(String(msg.code ?? '').toUpperCase().trim());
      if (!room) throw new RoomError('No room with that code');
    }
    if (session) leave(socket);
    room.join(msg.token, msg.name);
    sockets.set(socket, { room, token: msg.token });
    return broadcast(room);
  }
  if (!session) throw new RoomError('Join a room first');
  const { room, token } = session;
  if (msg.t === 'start') return room.start(token), broadcast(room);
  if (msg.t === 'roll') return broadcast(room, room.roll(token));
  if (msg.t === 'move') return broadcast(room, room.move(token, msg.pawn));
  if (msg.t === 'leave') return leave(socket);
  throw new RoomError('Unknown message');
}

const server = new WebSocketServer({ port: PORT, maxPayload: 2048 });
server.on('connection', (socket) => {
  socket.on('message', (data) => {
    try {
      const msg: unknown = JSON.parse(String(data));
      if (!msg || typeof msg !== 'object') throw new RoomError('Invalid message');
      handle(socket, msg as Record<string, unknown>);
    } catch (err) {
      // Rule and room errors are the player's to see; anything else stays in the server log.
      const expected = err instanceof RoomError || err instanceof RuleError || err instanceof SyntaxError;
      if (!expected) console.error(err);
      socket.send(JSON.stringify({ t: 'error', message: expected && !(err instanceof SyntaxError) ? (err as Error).message : 'Something went wrong' }));
    }
  });
  socket.on('close', () => leave(socket));
});

setInterval(() => {
  const cutoff = Date.now() - ROOM_IDLE_MS;
  for (const [code, room] of rooms) if (room.touched < cutoff) rooms.delete(code);
}, 60_000).unref();

console.log(`LOODL server listening on ws://localhost:${PORT}`);
