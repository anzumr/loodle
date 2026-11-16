# LOODL technology decisions (v3.0 handoff, web-first)

Status: Stage 0 in progress. Decisions below are made; items marked **unproven** have not been tested yet.

## Chosen stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript everywhere | One language for rules, client and server, so game rules cannot drift between offline and online play. |
| Rules | `packages/rules`, pure TypeScript, no DOM or rendering imports | Runs unchanged in the browser (offline play), in Node (authoritative server) and in tests. |
| 3D | three.js, driven by a plain scene class | Real WebGL 3D, small runtime, runs in every target browser and inside mobile web views. |
| UI | React + plain CSS with theme variables | Menus and HUD are DOM, which gives crisp text, accessibility, safe-area handling and easy theming. |
| Build | Vite, npm workspaces | Fast dev server, simple monorepo, no extra tooling. |
| Tests | Vitest | Runs the rules package directly from source. |
| Mobile packaging | Capacitor (iOS and Android), plus PWA for the website | Ships the same web build inside a native shell with access to native sign-in, purchases and push. **Unproven.** |
| Server (Stage 5) | Node.js + WebSocket rooms importing `packages/rules`; PostgreSQL | Turn-based play needs a few small messages per turn, not a high-frequency netcode stack. **Not built.** |

## Options considered

- **Unity (WebGL export).** Strong 3D tooling, but web builds are tens of megabytes, load slowly on phones, perform poorly in mobile Safari, and menus have to be built in engine UI. Poor fit for "visit the website and play immediately".
- **Babylon.js.** A capable full engine. Chosen against only because three.js is lighter and LOODL's scene is small (one board, at most 32 pawns, a die); either would work.
- **React Three Fiber.** A good React layer over three.js. Not used yet: the scene is one imperative object with its own render loop, which keeps per-frame work out of React. It can be adopted later without changing the rules package.
- **PlayCanvas, Godot web export.** Editor-centred workflows with heavier runtimes; less sharing with a TypeScript server.
- **2D frameworks (Phaser, Pixi).** Rejected: the board, pawns and camera must be real 3D.
- **React Native / Flutter.** Would need a second 3D and UI implementation for the web.

## How mobile reuse works

The website is the game. Capacitor wraps the built site in a native iOS/Android project, so rules, 3D, UI, assets and backend are shared. Native-only pieces are thin plugins: Sign in with Apple / Google, StoreKit and Play Billing purchases, push notifications, app lifecycle.

### Mobile risks still to prove

1. No Capacitor project exists yet. The packaging path is **not proven** until a native build runs on a device.
2. iOS builds need macOS. This machine is Windows, so iOS packaging needs a cloud Mac build service.
3. WebGL performance inside WKWebView on older iPhones is unmeasured.
4. Apple can reject apps that are thin wrappers around a website; native sign-in, purchases and offline play need to be in place before submission.
5. Web payments and native store purchases must feed one server-side entitlement record.

## What is not decided yet

- Hosting provider and realtime server library (Stage 5).
- Auth provider (Stage 6).
- Whether to move asset-heavy models to glTF files once final art exists.

## Visual assets: what is final and what is not

Everything on screen today is generated in code and is a **stand-in**, not final art:

- Logo: CSS-typeset wordmark following the approved structure (gold L/D/L, red and blue O's, crown). The approved rendered logo artwork has not been supplied as an image file and should replace it.
- Pawns, board, die: procedural three.js geometry and materials.
- Backdrop: CSS gradients suggesting the lit hall from the concepts; there is no modelled room.
- Icons: simple inline SVGs. Illustrated avatars and 3D-style icons from the concepts do not exist yet.
