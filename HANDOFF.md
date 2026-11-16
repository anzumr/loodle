# LOODL handoff — pick up here

Written 2026-11-16 for the next developer or coding agent. The product spec is the v3.0 "Complete Greenfield Development Handoff" (web first, mobile later). Read this file, then `README.md`, `docs/TECH_DECISIONS.md` and `docs/RULES.md`.

## Where things stand

### Continuation: Stage 6 profile basics — usernames and pictures (2026-11-16, uncommitted, NOT deployed)

- `packages/rules/src/username.ts`: shared display-name rules. 3–16 letters, numbers or underscores; reserved staff/system names; a short starter profanity list with digit-swap and repeated-letter handling. `validateUsername` gives a reason for the UI; `cleanUsername` falls back to "Guest"; `cleanAvatar` validates picture ids (0–7). The server's `cleanName` now delegates to it, so the filter is enforced server-side for every room.
- Profile sheet (tap the profile chip): name with live validation, eight built-in pictures (`apps/web/src/ui/Avatar.tsx`), then the existing Google sign-in panel. Stored locally as `loodl.name` and `loodl.avatar`. The Friends sheet warns when an unacceptable name will appear as Guest.
- Online: clients send `avatar` with create/join/quick; `RoomView.players[].avatar` is shown in the waiting room. Bots get their own pictures.
- Validation: **129 tests pass** (8 new username/avatar tests), typecheck and build pass. In a local browser at phone size the profile sheet showed the right message for short, reserved and blocked names, saved "Alex_12" with a picture, and updated the lobby chip. **Not verified:** pictures in an online waiting room were not viewed in a browser (the local game server was off for this check).
- **Not built, and each needs a database the project does not have yet:** unique friend codes, controlled rename limits, profiles that follow a Google account across devices, frames/banners/titles, privacy settings, account deletion and recovery. Choosing and paying for a database (Render's free Postgres expires after a limited period) is an owner decision.
- The blocklist is a deliberately short starter and will reject some innocent names containing a blocked string. Replace it with a maintained list or moderation service before chat or public profiles.
- Pictures are placeholder pawn icons in eight colours, not the illustrated avatar collection or 3D pawn portraits from the spec.
- The earlier Quick Play commit `9d43dec` is pushed but, like this work, is only live after a manual deploy in Render.

### Continuation: Quick Play matchmaking, bots and rematch (2026-11-16, uncommitted, NOT deployed)

- **Quick Play** (Stage 5 casual matchmaking): new client message `quick {token,name,variant}`. The server puts the player in an open public room for that mode or opens one. Public rooms start by themselves: at once with four players, after an 8-second countdown from the second player. `Room.isPublic`, `joinable`, `lobbyTick()`; `RoomView.public` and `startsAt`.
- **Bots:** if nobody else joins a Quick Play room within 15 seconds, the empty seats are filled with computer players (`Player.bot`, shown as "Bot" in the waiting room) and the match starts. Bots act through `Room.tick()` after a 1.2-second pause using the medium AI. They never appear in private rooms. Bot tokens are `bot:N`; client tokens are always prefixed `guest:` or `google:` in `index.ts`, so a client cannot claim one.
- **Rematch:** message `rematch` after a finished match returns connected players to the waiting room and drops bots and disconnected players. Private rooms then wait for the host to start; public rooms search and count down again. The results sheet's "Play again" sends it when online.
- Web: PLAY sheet has a working Quick Play button (uses the selected Classic / Race / Clash mode); the waiting sheet shows "Finding players…" or the countdown for public rooms.
- Validation: **121 tests pass** (9 new in `apps/server/test/quickplay.test.ts`), typecheck clean. In a local browser, Quick Play showed the waiting room, bots filled after 15 seconds, and a four-player Quick Race ran for about five minutes with bots taking turns. **Not verified:** that browser match was not played to its end, "Play again"/rematch was not exercised in a browser or over real sockets (room-level tests only), and two real people being matched together was not tested in browsers.
- **The live site at loodle.online does not have any of this** until it is committed, pushed and deployed in Render (auto-deploy is off).
- Known gaps: one bot difficulty; matchmaking is one in-memory process with no regions, skill or reconnection to the queue; a Quick Play room with bots is slow for four players (about 1.2 s per bot action).
- Also on 2026-11-16: loodle.online failed to load on the owner's PC only because the Windows DNS cache held Namecheap's old parking address `162.255.119.8`. It expired by itself; DNS and hosting were correct throughout. `ipconfig /flushdns` needs an administrator terminal on that machine.

### Live Render deployment (2026-11-16)

- Owner approved and deployed the free-tier Blueprint. Service `srv-dbtj1mei0phs73dgdf60` (`loodle-n26t`) is live at `https://loodle-n26t.onrender.com`, in My Workspace. Current verified deploy: `dep-dbtj2ap5efls73f9p170`, source commit `45d9d68104badfb16cc1a418adccb3e4e0a683bf`. Blueprint `exs-dbtiu9jl550s73ddm7c0` is manually synced; auto-deploy remains off.
- Live checks passed: homepage HTTP 200, `/healthz`, Google client configuration, two-client room join, server roll/state agreement and seat recovery over WSS using the real Render browser origin. Google login itself has not been tested.
- `PUBLIC_ORIGIN` includes the assigned Render hostname in both source and service configuration. Its merged environment update triggered the verified second deploy; no separate duplicate deploy was requested.
- Namecheap A `@` → `216.24.57.1` and CNAME `www` → `loodle-n26t.onrender.com` are verified by authoritative and public DNS. **https://loodle.online is live** with valid TLS, homepage HTTP 200 and healthy `/healthz`. **https://www.loodle.online** has valid TLS and returns HTTP 301 to the apex. A two-client WSS smoke check through loodle.online passed room creation, synchronized server roll and disconnect/rejoin seat recovery. TLS checks used the verified target IP to avoid stale local DNS cache while preserving hostname/certificate validation. Live Google consent and visual/touch browser QA remain unverified.

### Free-tier deployment selection (2026-11-16)

- Source is pushed to private `https://github.com/anzumr/loodle`, branch `codex/loodle-hosting`. GitHub web CI (including Docker build) and legacy Core tests passed for the initial release commit.
- Render GitHub access is fixed. Existing Blueprint: `exs-dbtiu9jl550s73ddm7c0`, workspace `tea-dbi3hvtg1s2s73dsva1g`; reuse this Blueprint, do not create a duplicate. Its first paid-plan attempt failed with `need_payment_info` and applied no infrastructure.
- Owner chose the **free tier**. `render.yaml` now uses `plan: free`. Free web services may sleep after 15 minutes without inbound traffic and take about a minute to wake. Online rooms are memory-only and disappear on restart; monthly free instance hours are shared across workspace services.
- Push this configuration and re-plan the existing Blueprint. Review the returned plan with the owner before applying it, as required by Render's approval tool. DNS remains unchanged.

### GitHub and Render authorization (2026-11-16)

Owner explicitly authorized creating the private `anzumr/loodle` repository, committing/pushing the prepared work, and using Render's **My Workspace** (`tea-dbi3hvtg1s2s73dsva1g`) to prepare the deployment plan. This supersedes pending commit/workspace notes below. Applying the planned infrastructure still requires review and approval of the returned Render plan. DNS has not been changed.

### Continuation: Stage 6 Google sign-in and loodle.online hosting preparation (2026-11-16, uncommitted)

- Owner supplied the public Google OAuth web client ID; it is now configured as `GOOGLE_CLIENT_ID` in `render.yaml`. It has not been deployed or tested with live Google sign-in. The older “not supplied” and “supply Google client ID” notes below are superseded. Commit/push and Render workspace confirmation remain pending.

- Owner confirmed ownership of **loodle.online** at Namecheap, GitHub for source, and **guest play plus Google sign-in**. Render is now connected; `list_workspaces` returned “My Workspace”. Confirm that workspace before resource mutations, as required by Render's tool contract. No resources have been created, no GitHub repository/remote has been created, and DNS is unchanged.
- Server now serves the built website, health endpoint `/healthz`, Google auth endpoints `/api/auth/*`, and WebSockets `/ws` on one port. Vite proxies `/api` and `/ws` locally. Production uses same-origin HTTPS/WSS. `PUBLIC_ORIGIN` is required in production.
- Google sign-in uses the official `google-auth-library`, audience and nonce validation, CSRF checks, and signed HttpOnly session cookies (Secure in production, 24 hours). Stable Google subjects own signed-in online seats; guest tokens are in a separate namespace. UI retains guest play and hides the Google button when unconfigured. A real Google OAuth web client ID has been requested but not supplied.
- Accounts are an initial identity foundation: no profile database, cloud saves/progression, account merging, or completed Stage 6 v3 specification. Signing in does not transfer guest rooms. Local offline saves stay local. Authentication is tested with mocked Google verification and locally signed test sessions, **not** a live Google login.
- Added `Dockerfile`, `.dockerignore`, `render.yaml`, GitHub web CI, and `docs/HOSTING.md`. Proposed Render compute is paid `0.5c-512mb`, one instance; no plan has been purchased or approved. Auto-deploy is off. Docker Desktop's engine is stopped, so no local container-build claim. Room persistence is still missing: restarts lose online matches.
- Added message limits, room/socket caps, WebSocket origin validation, static-file path restrictions and graceful shutdown. Authenticated clients cannot be impersonated with guest tokens.
- Checks: **112 tests pass**, typecheck and production build pass. Hosting smoke passed HTTP/assets, origin rejection, signed-account seat recovery and guest impersonation rejection. The long rules simulation now has a 20-second test deadline because the larger parallel suite exceeded its prior five-second limit; assertions are unchanged. Browser rendering, live Google consent, actual hosting/TLS and DNS cutover remain unverified.
- A full real-socket match through `/ws` also passed: automatic reconnect preserved the seat, and both clients agreed after 148 actions.
- Next: review and authorize committing/pushing the prepared changes to a private `anzumr/loodle` repo; confirm Render workspace; create a deployment plan and review it before provisioning; supply Google client ID; deploy and then update only Namecheap web records. Full instructions: `docs/HOSTING.md`.

### Continuation: Stage 5 connection recovery and timers (2026-11-16, uncommitted)

- Client automatically reconnects with bounded backoff, rejoining the last acknowledged room with the same token. Room codes are remembered per test identity and rejoined on reload. Controls wait for fresh server state; roll/move requests are never replayed. Closing the room cancels retries. A missing/expired room ends retries with the server error.
- Online sessions retain the offline match separately and restore it on leaving or a rejected join. Offline storage is not overwritten by online updates. This integration has been inspected but has not been browser-tested.
- Server gives **30 seconds per action** (each roll or pawn choice), then rolls or selects a legal medium-AI move automatically. Rejoining cannot extend the deadline. Empty rooms do not auto-play. Clients show the deadline and explain automatic play before starting.
- WebSocket ping/pong detects dead peers; idle cleanup now retains occupied rooms. HTTPS pages default to `wss://`, but TLS hosting is still not deployed.
- Validation: **95 tests pass**, typecheck and production build pass (existing bundle-size warning). `npm run smoke:reconnect -w @loodl/server` used the actual browser connection controller over real sockets, recovered its seat automatically and finished a 158-action match with identical client states. Existing `smoke` also passed (202 actions, disconnect/rejoin, identical results). Temporary servers were stopped. No browser rendering/touch checks were run.
- Still outstanding in Stage 5: casual matchmaking, rematches, durable room persistence, deployment/TLS termination, rate limiting, multiple server processes and two-browser-context tests. Stage 4 practice/challenges/campaign and Stage 0 mobile/PWA work remain unfinished.
- This section supersedes older reconnect, absent-player and offline-save gaps below. No commits were made.

### Continuation: interactive tutorial (2026-11-16, uncommitted)

- Added **PLAY → Learn by playing**, also accessible from How to play: eight independent board lessons covering entry, movement, capture, safety, blockades, overshooting, finishing, and three sixes.
- `apps/web/src/tutorial.ts` owns lesson positions and scripted dice; all actions run through the existing rules engine. `apps/web/src/ui/Tutorial.tsx` owns the tutorial board and controls, with manual pawn selection, keyboard buttons, restart and exit. The lobby renderer is disposed while the tutorial is open.
- Tutorial state is separate from saved/offline/online matches and is not persisted. No changes to locked rules or normal random dice.
- Validation: 86 tests pass (including 11 tutorial tests), typecheck and production build pass. The existing large-bundle warning remains. Browser layout, touch interactions and save/resume integration have not been browser-tested in this continuation.
- Next Stage 4 work: practice mode and challenge scenarios, then campaign framework, mode-aware AI and browser smoke tests. Extract existing match flow from `App.tsx` before expanding the match modes. Shorter quick layouts and turn timers remain outstanding.
- The original status below describes the prior handoff; its “tutorial not started” entries are superseded by this section.

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
