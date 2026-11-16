/**
 * Two real WebSocket clients play a whole match against a running server.
 * Start the server first (npm run server), then: npm run smoke -w @loodl/server
 */
import { WebSocket } from 'ws';
import { legalMoves, type MatchState } from '@loodl/rules';

const URL = process.env.SERVER_URL ?? 'ws://localhost:8787';
interface RoomMsg {
  t: string;
  message?: string;
  you: number;
  room: { code: string; players: { seat: number | null; connected: boolean }[]; match: MatchState | null };
}

function client(token: string) {
  const ws = new WebSocket(URL);
  const state = { last: null as RoomMsg | null, errors: [] as string[], messages: 0 };
  ws.on('message', (data) => {
    const msg = JSON.parse(String(data)) as RoomMsg;
    state.messages++;
    if (msg.t === 'error') state.errors.push(msg.message ?? '');
    else state.last = msg;
  });
  const send = (m: object) => ws.send(JSON.stringify(m));
  const open = new Promise<void>((resolve, reject) => (ws.once('open', () => resolve()), ws.once('error', reject)));
  return { ws, state, send, open, token };
}

const until = async (check: () => boolean, what: string) => {
  for (let i = 0; i < 400; i++) {
    if (check()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error(`Timed out waiting for ${what}`);
};

const a = client('smoke-token-aaaaaaaaaaaa');
let b = client('smoke-token-bbbbbbbbbbbb');
await Promise.all([a.open, b.open]);

a.send({ t: 'create', token: a.token, name: 'Alex', variant: 'race' });
await until(() => !!a.state.last, 'room creation');
const code = a.state.last!.room.code;
b.send({ t: 'join', token: b.token, name: 'Emma', code: code.toLowerCase() });
await until(() => a.state.last!.room.players.length === 2, 'second player');

b.send({ t: 'start' }); // not the host
await until(() => b.state.errors.length === 1, 'non-host start to be refused');
a.send({ t: 'start' });
await until(() => !!b.state.last?.room.match, 'match start');

// Cheating attempts: act out of turn, and try to dictate the die.
b.send({ t: 'roll' });
await until(() => b.state.errors.length === 2, 'out-of-turn roll to be refused');
a.send({ t: 'roll', value: 6 });
await until(() => a.state.last!.room.match!.version === 1, 'first roll');

let reconnected = false;
let actions = 1;
for (;;) {
  const match = a.state.last!.room.match!;
  if (match.turn.phase === 'over') break;
  // Halfway through, drop B's connection and reconnect with the same token.
  if (!reconnected && actions > 40) {
    b.ws.close();
    await until(() => a.state.last!.room.players[1]!.connected === false, 'disconnect notice');
    b = client(b.token);
    await b.open;
    b.send({ t: 'join', token: b.token, name: 'Emma', code });
    await until(() => !!b.state.last && a.state.last!.room.players[1]!.connected, 'reconnect');
    if (b.state.last!.room.match!.version !== match.version) throw new Error('Reconnected client got a stale match');
    reconnected = true;
  }
  const me = match.turn.seat === a.state.last!.room.players[0]!.seat ? a : b;
  await new Promise((resolve) => setTimeout(resolve, 400)); // respect public-server message limits
  me.send(match.turn.phase === 'roll' ? { t: 'roll' } : { t: 'move', pawn: legalMoves(match)[0]!.pawn });
  const version = match.version;
  await until(() => a.state.last!.room.match!.version > version, `action ${actions}`);
  actions++;
}

await until(() => b.state.last!.room.match!.turn.phase === 'over', 'both clients to see the result');
const final = a.state.last!.room.match!;
const same = JSON.stringify(final) === JSON.stringify(b.state.last!.room.match);
console.log(JSON.stringify({ code, actions, reconnected, finishOrder: final.finishOrder, clientsAgree: same, refused: b.state.errors.length + a.state.errors.length }));
a.ws.close();
b.ws.close();
if (!same || !reconnected) process.exit(1);
