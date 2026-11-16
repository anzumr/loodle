# LOODL — Codex Stage 0 kickoff prompt v1.2

We are building **LOODL**, a simple-to-play and deep-to-master iPhone/iPad Ludo game. **Read `LOODL_Production_Handoff_v1.2.md` in full before changing any code.** Do not rely on superseded v1.0 or v1.1 handoffs.

## Confirmed owner decisions
- Development takes place on a **Windows PC** with **Unity 6.3 LTS**, C#, URP, Git/GitHub and local .NET testing. Owner has a **physical iPhone** and can use **Unity Build Automation/cloud macOS for signed iOS builds** later. Never assume Xcode is installed locally; do not say iOS works until a real cloud build and phone launch have succeeded.
- **Triple-six rule FULLY CONFIRMED:** After `6 → 6 → 6` during one continuous active-turn sequence, the third six immediately forfeits the rest of the turn, permits **no** pawn action or bonus, and transfers control to the next eligible player. **Legally completed moves from the first two sixes remain on the board without rollback.** Reset the sixes counter at turn transfer. Capture-generated bonus/streak interactions remain open separately. Do not describe first-two-move retention as TBD.
- LOODL is UX-first: one oversized PLAY, skippable profile customization, guest casual online; permanent account linking required for ranked/advanced social. Later full 2–8 player modes and cosmetics are not Stage 0 scope.

## STAGE 0 ONLY: primary work
1. Inspect the current workspace. Detect installed Unity Hub/Editor, .NET SDK, Git and GitHub connectivity. **Do not overwrite existing project files.** Report what is available before choosing commands.
2. If Editor access exists, create or validate a **Unity 6.3 LTS Universal 3D/URP** project at `unity-client/` and pin version/packages. If Editor is unavailable, create clear manual setup steps and label the Unity project **NOT VERIFIED**; no fabricated working scaffold.
3. Establish a Git repository with Unity-appropriate `.gitignore`, `README.md`, dependency/version notes, and a private GitHub setup guide (don't create a public repo by accident). Never commit Editor caches, Apple signing material, tokens or passwords.
4. Implement a **pure C#**, UnityEngine-free `src/Loodl.Core/` foundation: typed match/player/pawn state, turn phase, board/ruleset contract, typed actions/events, injected dice RNG, deterministic serialization/event-replay boundaries, and explicit rule IDs. Use a Unity-compatible .NET API surface; do not couple core engine to UGS or UI.
5. Add `tests/Core.Tests/` with executable NUnit/xUnit tests covering initial state and invariants, deterministic dice adapter, JSON round trip, invalid/wrong-turn action rejection, replay consistency, and one **third-consecutive-six policy contract/test scaffold** that explicitly records preserving the first two completed moves. Clearly distinguish interface/contract tests from full game-behavior tests, which belong to Stage 1.
6. Write `docs/RULEBOOK_DECISIONS.md` where `third_consecutive_six_forfeits_turn=CONFIRMED`, `first_two_moves_remain=CONFIRMED`, `capture_bonus_interactions=OPEN`. Add `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md`, `docs/TEST_REPORT.md`.
7. Write `docs/IOS_BUILD_RUNBOOK.md`: Windows → GitHub → Unity Build Automation (cloud macOS/Xcode) → Apple signing/provisioning → iPhone/TestFlight. Describe missing Apple Developer membership/cert status as **UNKNOWN** until owner verifies; no signing secrets in repo.
8. Set up CI for pure C# tests if repository access exists. Do not configure paid cloud builds, payment accounts or provisioning credentials without the owner's authorization.

## Verification and reporting
- Run `dotnet test` on actual tests; report exact commands and **passed/failed/skipped** counts with real output. Run Unity Editor smoke checks only if Unity is available. Never replace an unavailable tool check with an invented success.
- End with a **stage-gate report**: files changed, actual tests, unresolved dependencies, exact steps for the owner, risks, evidence, next Stage 1 ticket.
- Mark separate outcomes: **C# tests**, **Unity Editor open/compile**, **Cloud iOS build**, **iOS signing**, **iPhone install/launch**. Any one cannot stand in for another.

## Explicit exclusions
Do not implement full Ludo matches, all 2–8 boards, networking, Matchmaker/Cloud Code, account systems, shops/IAP, 3D pawn art, animated avatars, ranked ladders or live multiplayer. We need an honest, maintainable foundation.
