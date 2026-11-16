# LOODL handoff — pick up here

Written 2026-11-16 for the next developer or coding agent. The product spec is the v3.0 "Complete Greenfield Development Handoff" (web first, mobile later). Read this file, then `README.md`, `docs/TECH_DECISIONS.md` and `docs/RULES.md`.

## Where things stand

Branch: `web/stage0-foundation`. No remote is configured; nothing has been pushed.

| Commit | Contents |
|---|---|
| `4e3bfb7` | Monorepo, board topology + tests, lobby, 3D board |
| `acf4472` | Rules engine + tests, playable pass-and-play match |
| `61593fa` | AI (5 levels) + tests, square-by-square pawn movement, Solo mode, sound effects, save/resume, this file |
| `d75e3b7` | Quick Race and Quick Clash rules + tests, mode picker, live scores, How to play sheet |
| latest commit (see `git log`) | Game server with private rooms (`apps/server`), Friends screen in the web app, room tests, two-client smoke script |

Roadmap position against the v3.0 stages:

- **Stage 0** (architecture, proof of concept): done for web. **Not done:** Capacitor/native packaging proof, PWA setup.
- **Stage 1** (visual foundation, classic board): done with code-generated placeholder art.
- **Stage 2** (classic rules engine): done.
- **Stage 3** (playable offline game): done. Sounds are synthesised placeholders.
- **Stage 4** (AI and offline modes): **in progress.** Done: five AI levels, Solo mode, save/resume, Quick Race and Quick Clash, a static How to play sheet. Not started: interactive tutorial, practice mode, challenge scenarios, campaign framework.
- **Stage 5** (online multiplayer): **started.** Done: authoritative WebSocket server, private rooms with 5-character invite codes, server-rolled dice, turn and move validation, seat held on disconnect and reclaimed on rejoin, Friends screen. Not done: casual matchmaking, automatic reconnect in the client, turn timers / handling of absent players, persistence (rooms live in memory), deployment, TLS (`wss://`), rate limiting, more than one server process.
- Stages 6–12: not started.

## Run and check

```bash
npm install
npm run dev        # website, http://localhost:5173
npm run server     # game server, ws://localhost:8787 (needed only for Friends rooms)
npm run smoke -w @loodl/server   # two socket clients play a full match against the running server
npm test           # Vitest; AI strength test takes ~10 s
npm run typecheck
npm run build
```

Last known results: 75 tests passing (16 board, 34 engine, 5 AI, 9 quick modes, 11 server rooms), typecheck clean, production build succeeds. The smoke script completed a 129-action Quick Race over real sockets, including a mid-match disconnect and rejoin, with both clients ending on identical state. Two browser tabs (the second opened with `?p=b` for a separate identity) created and joined a room and played about a minute in sync; that browser match was not played to its end.

## Code map

- `packages/rules/src/classicBoard.ts` — 15×15 topology. Seats 0–3 = red, green, yellow, blue, clockwise. 52-square loop starting at red's start; each seat's path is 57 nodes (51 shared, 5 lane, finish).
- `packages/rules/src/engine.ts` — `createMatch`, `legalMoves`, `applyAction` (the only mutation path; returns new state + events), `replay`, `serializeMatch`/`deserializeMatch`, `seededDice`. Pawn progress: `-1` yard, `0–55` path, `56` home. Die values are supplied inside roll actions.
- Quick modes are `RulesConfig` presets in `engine.ts` (`QUICK_RACE_RULES`, `QUICK_CLASH_RULES`) using `startOnBoard`, `pawnsToWin`, `endOnFirstFinish`, `targetScore`, `capturePoints`, `homePoints`. `MatchState.scores` holds points per seat. Definitions are in `docs/RULES.md`.
- `packages/rules/src/ai.ts` — `chooseMove(state, level, random)`. Heuristic scoring per level. Picks only among legal moves; never touches dice.
- `apps/server/src/room.ts` — one room: players, seats, the authoritative match. No networking, so it is unit-tested directly. Clients can only ask to roll or move; the die comes from `node:crypto`.
- `apps/server/src/index.ts` — WebSocket transport. Protocol is documented at the top of the file: `create | join | start | roll | move | leave` in, full `room` view or `error` out.
- `apps/web/src/net.ts` — client connection and the per-browser secret token (`loodl.token`) used to reclaim a seat. Server address comes from `VITE_SERVER_URL` (see `apps/web/.env.example`), defaulting to port 8787 on the page's host.
- `apps/web/src/scene/BoardScene.ts` — three.js scene: board, pawns, lighting, three camera modes (`lobby`, `angled`, `top`), `setView(MatchView)` to draw a match, nearest-movable-pawn tap picking via `onPawnTap`.
- `apps/web/src/App.tsx` — all screens and match flow: lobby, mode sheet, HUD, results, AI turn timers, localStorage save (`loodl.match`), settings (`loodl.quality`, `loodl.sound`).
- `apps/web/src/sound.ts` — Web Audio synth effects.
- `apps/web/src/styles.css` — blue-and-gold theme as CSS variables.

## Rules that must not change

Third consecutive six: the turn ends immediately, no pawn moves, the first two moves stand, play passes on. It is the constant `SIX_LIMIT` with dedicated tests. Other rule choices and their switches are in `docs/RULES.md`; several are interpretations awaiting the owner's confirmation.

## Known gaps and rough edges

- All art is placeholder: CSS wordmark logo, procedural pawns/board/die, gradient backdrop, simple SVG icons. The approved logo has not been supplied as an image file.
- Measured AI win rates over 300 two-player games each: easy 68%, medium 87%, hard 93%, expert 93% versus beginner; hard 64% and expert 61% versus medium. **Expert is not measurably stronger than hard** and needs real look-ahead.
- Quick modes use the full classic board; the spec also asks for shorter tracks or dedicated shorter layouts, faster animations and optional turn timers. None of those exist. The quick victory conditions and point values are my proposal and need the owner's approval.
- The AI scores moves the same way in every mode; it does not know about Clash points or the two-pawn Race goal.
- In the browser, Quick Clash was started and watched for about 90 seconds (scores updated after a capture) but not played to its results screen. Quick Race was not opened in the browser. Both are covered to completion by rules tests.
- Online: if the connection drops, the client returns to the Friends screen and the player must re-enter the code by hand; there is no automatic retry. A player who never returns blocks the match, because there are no turn timers. Leaving an online match discards any saved offline match. The token is a bearer secret in localStorage, not an account.
- All AI seats in a Solo match share one level and one rival name (Pip, Dot, Rook, Vex, Sable).
- `App.tsx` holds too much; split match flow into a hook before adding modes.
- The JS bundle is one ~780 kB chunk (three.js); no code splitting.
- The 3D die only appears in the lobby; in a match the die is a DOM element in the HUD.
- No automated browser tests. Browser checks so far were manual and scripted in the dev preview at 800×600, 375×812 and 812×375. Nothing has been run on a real phone, Safari or Firefox, and real touch gestures are untested.
- No performance measurements.
- Files from the earlier Unity/C# plan (`src/Loodl.Core`, `tests/Core.Tests`, `global.json`, `Directory.Build.props`, `.github/workflows/core-tests.yml`, v1.2 documents, older files in `docs/`) are superseded and unused. Ask the owner before deleting them.

## Suggested next steps, in order

1. Commit the uncommitted work if `git status` shows any, after `npm test`, `npm run typecheck` and `npm run build` pass.
2. Finish Stage 4: interactive tutorial (scripted dice via roll actions), practice mode, challenge scenarios, campaign framework, shorter quick layouts and turn timers. Teach the AI the quick-mode goals. Add Playwright smoke tests for lobby → match → results in each mode.
3. Close the Stage 0 gap: add a PWA manifest and service worker, then a Capacitor Android project and run it on a device or emulator. iOS needs a cloud macOS build (the owner is on Windows with an iPhone).
4. Finish Stage 5: automatic client reconnect with the stored room code, turn timers with auto-play or forfeit for absent players, casual matchmaking queue, a rematch flow, room persistence, deployment with `wss://`, basic rate limiting, and a Playwright test with two browser contexts.
5. Replace placeholder art as real assets arrive.

## Working agreements with the owner

- Gameplay and visual quality have equal priority; do not ship generic placeholders as final.
- Never show a feature as working when it is not (unbuilt modes are disabled and tagged "Soon").
- Report real test results and screenshots only; state what was not verified.
- Commit only when the owner asks. Do not commit secrets or signing credentials.
