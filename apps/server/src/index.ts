/**
 * LOODL game server: private rooms over WebSocket.
 *
 * Messages are small JSON objects. After every change the server sends each
 * player in the room the full room view, which keeps clients simple and makes
 * reconnecting trivial: rejoin with the same token and you get the current state.
 *
 * Client → server:  create {token,name,variant,dice} | join {token,name,code} | quick {token,name,variant,dice}
 *                    | start | roll | move {pawn} | rematch | leave
 * Server → client:  room {room, you, events} | error {message}
 */
import { randomInt } from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { RuleError, type Dice } from '@loodl/rules';
import { Room, RoomError, VARIANTS, type Variant } from './room';
import { createAuth } from './auth';
import { serveWeb } from './http';

const PORT = Number(process.env.PORT ?? 8787);
const production = process.env.NODE_ENV === 'production';
const origins = (process.env.PUBLIC_ORIGIN ?? (production ? '' : 'http://localhost:5173,http://localhost:8787')).split(',').filter(Boolean);
if (production && !origins.length) throw new Error('Set PUBLIC_ORIGIN to your HTTPS site origin');
const auth = createAuth({ clientId: process.env.GOOGLE_CLIENT_ID, secret: process.env.AUTH_SECRET, secure: production, origins });
const webRoot = fileURLToPath(new URL('../../web/dist/', import.meta.url));
const ROOM_IDLE_MS = 30 * 60 * 1000;
const CODE_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no look-alikes (0/O, 1/I/L)

const dice: Dice = { roll: () => randomInt(1, 7) };
const rooms = new Map<string, Room>();
const sockets = new Map<WebSocket, { room: Room; token: string }>();
const alive = new Set<WebSocket>();

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

function handle(socket: WebSocket, msg: Record<string, unknown>, request: IncomingMessage) {
  const session = sockets.get(socket);
  const account = auth.account(request);
  if (session?.token.startsWith('google:') && !account) throw new RoomError('Your sign-in has expired. Sign in again.');
  if (msg.t === 'create' || msg.t === 'join' || msg.t === 'quick') {
    if (session) throw new RoomError('Leave your current room first');
    if (typeof msg.token !== 'string' || msg.token.length < 16 || msg.token.length > 64) throw new RoomError('Invalid player token');
    const token = account ? `google:${account.id}` : `guest:${msg.token}`;
    let room: Room | undefined;
    const variant = (typeof msg.variant === 'string' && Object.hasOwn(VARIANTS, msg.variant) ? msg.variant : 'classic') as Variant;
    // Quick Play: join an open public room for this mode if there is one, otherwise open a new one.
    const diceCount: 1 | 2 = msg.dice === 2 ? 2 : 1;
    if (msg.t === 'quick') room = [...rooms.values()].find((r) => r.joinable && r.variant === variant && r.diceCount === diceCount && r.indexOf(token) < 0);
    if (msg.t === 'create' || (msg.t === 'quick' && !room)) {
      if (rooms.size >= 500) throw new RoomError('Server is full. Please try again later.');
      room = new Room(newCode(), variant, dice, msg.t === 'quick', diceCount);
      rooms.set(room.code, room);
    } else if (msg.t === 'join') {
      room = rooms.get(String(msg.code ?? '').toUpperCase().trim());
      if (!room) throw new RoomError('No room with that code');
    }
    room!.join(token, msg.name, msg.avatar);
    room = room!;
    sockets.set(socket, { room, token });
    return broadcast(room);
  }
  if (!session) throw new RoomError('Join a room first');
  const { room, token } = session;
  if (msg.t === 'start') return room.start(token), broadcast(room);
  if (msg.t === 'roll') return broadcast(room, room.roll(token));
  if (msg.t === 'move') return broadcast(room, room.move(token, msg.pawn, msg.die));
  if (msg.t === 'rematch') return room.rematch(token), broadcast(room);
  if (msg.t === 'leave') return leave(socket);
  throw new RoomError('Unknown message');
}

const http = createServer((request, response) => {
  void (async () => {
    if (!await auth.handle(request, response)) await serveWeb(request, response, webRoot);
  })().catch(() => { if (!response.headersSent) response.writeHead(500); response.end(); });
});
const server = new WebSocketServer({ noServer: true, maxPayload: 2048 });
http.on('upgrade', (request, socket, head) => {
  const path = request.url?.split('?')[0];
  const allowed = request.headers.origin
    ? origins.includes(request.headers.origin) || (!production && request.headers.origin === `http://${request.headers.host}`)
    : !request.headers.cookie;
  if ((path !== '/ws' && (production || path !== '/')) || !allowed || server.clients.size >= 1000) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); return;
  }
  server.handleUpgrade(request, socket, head, (ws) => server.emit('connection', ws, request));
});
server.on('connection', (socket, request) => {
  socket.on('error', () => socket.close());
  let budget = 30;
  let resetAt = Date.now() + 10_000;
  alive.add(socket);
  socket.on('pong', () => alive.add(socket));
  socket.on('message', (data) => {
    if (Date.now() >= resetAt) { budget = 30; resetAt = Date.now() + 10_000; }
    if (--budget < 0) { socket.close(1008, 'Too many messages'); return; }
    try {
      const msg: unknown = JSON.parse(String(data));
      if (!msg || typeof msg !== 'object') throw new RoomError('Invalid message');
      handle(socket, msg as Record<string, unknown>, request);
    } catch (err) {
      // Rule and room errors are the player's to see; anything else stays in the server log.
      const expected = err instanceof RoomError || err instanceof RuleError || err instanceof SyntaxError;
      if (!expected) console.error(err);
      socket.send(JSON.stringify({ t: 'error', message: expected && !(err instanceof SyntaxError) ? (err as Error).message : 'Something went wrong' }));
    }
  });
  socket.on('close', () => { alive.delete(socket); leave(socket); });
});

const heartbeat = setInterval(() => {
  for (const socket of server.clients) {
    if (!alive.delete(socket)) socket.terminate();
    else socket.ping();
  }
}, 15_000);
heartbeat.unref();

const turns = setInterval(() => {
  for (const room of rooms.values()) {
    if (room.lobbyTick()) broadcast(room);
    const events = room.tick();
    if (events.length) broadcast(room, events);
  }
}, 1000);
turns.unref();
server.on('close', () => { clearInterval(heartbeat); clearInterval(turns); });

setInterval(() => {
  const cutoff = Date.now() - ROOM_IDLE_MS;
  for (const [code, room] of rooms) if (room.empty && room.touched < cutoff) rooms.delete(code);
}, 60_000).unref();

http.listen(PORT, '0.0.0.0', () => console.log(`LOODLE listening on http://localhost:${PORT} (WebSocket /ws)`));
const shutdown = () => {
  for (const socket of server.clients) socket.close(1012, 'Server restarting');
  http.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
