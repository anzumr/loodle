# LOODL

A web-first 3D multiplayer Ludo game. Roll. Rival. Repeat.

Current state: **offline play works.** Classic, Quick Race and Quick Clash for two to four players, either pass-and-play on one device or solo against five levels of computer rival, with sound and matches that survive a reload. Friends can also play online in a private room with an invite code when the game server is running (`npm run server`). There are no accounts, matchmaking or deployment yet. See `HANDOFF.md` for detailed status.

## Run it

Requires Node 20 or newer.

```bash
npm install
npm run dev
```

Open http://localhost:5173. To try it on a phone, open the "Network" address Vite prints while both devices are on the same Wi-Fi.

| Command | What it does |
|---|---|
| `npm run dev` | Website dev server with hot reload |
| `npm run server` | Game server for Friends rooms (ws://localhost:8787) |
| `npm test` | Rules/board tests (Vitest) |
| `npm run typecheck` | TypeScript check for all packages |
| `npm run build` | Production build into `apps/web/dist` |

## Layout

```
packages/rules   Pure TypeScript game logic. No rendering or browser imports.
  src/classicBoard.ts   Classic 15×15 board: every cell, path, start, star, lane.
  src/engine.ts         Rules engine: legal moves, captures, blockades, bonuses, finishing, replay.
  test/                 Topology tests.
apps/server      Game server: private rooms, authoritative dice and moves (Node + ws).
apps/web         The website (Vite + React + three.js).
  src/scene/BoardScene.ts   3D board, pawns, lighting, cameras, tap picking.
  src/App.tsx               Lobby, mode sheet, board screen.
  src/styles.css            LOODL blue-and-gold UI theme.
docs/RULES.md                Rules as implemented, settings, and interpretations.
docs/TECH_DECISIONS.md      Stack choice, tradeoffs, mobile risks, placeholder list.
```

## Earlier work in this folder

`src/Loodl.Core`, `tests/Core.Tests`, `global.json`, `Directory.Build.props`, `.github/workflows/core-tests.yml`, the v1.2 documents and the other files in `docs/` come from the earlier Unity/C# plan. The v3.0 web-first handoff supersedes that plan. Those files are untouched and unused by the web project.
