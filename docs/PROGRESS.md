# Stage 0 gate — 2026-10-14

Status: **C# foundation delivered; overall Stage 0 gate OPEN.** Do not advance to Stage 1 without gate review. A playable game is not delivered.

## Completed

- Inspected the initial workspace; preserved the supplied handoffs.
- Installed a local ignored .NET SDK and initialized Git on `stage0/foundation`.
- Added controlled typed state, rules/layout contracts, injected simulation dice, typed roll action/event, snapshot and replay boundaries, and explicit third-six preservation policy.
- Executed xUnit tests: 24 passed, 0 failed, 0 skipped. Verified locked restore with network access.
- Prepared CI workflow, Unity/private-repository setup instructions and cloud iOS runbook.

## Files added

- `.gitignore`, `global.json`, `Directory.Build.props`, `README.md`
- `.github/workflows/core-tests.yml`
- `src/Loodl.Core/{Loodl.Core.csproj,Model.cs,Engine.cs,SnapshotJson.cs,packages.lock.json}`
- `tests/Core.Tests/{Core.Tests.csproj,FoundationTests.cs,packages.lock.json}`
- `docs/{ARCHITECTURE.md,DECISIONS.md,RULEBOOK_DECISIONS.md,PROGRESS.md,TEST_REPORT.md,UNITY_SETUP.md,GITHUB_SETUP.md,IOS_BUILD_RUNBOOK.md}`
- `docs/{core-test-output.txt,locked-restore-output.txt}`

Ignored local SDK/cache/build/test artifacts also exist. The three original v1.2 documents were not modified.

## Remaining dependencies and owner steps

1. Install/open Unity 6.3 LTS via `docs/UNITY_SETUP.md` (or identify an existing custom Editor path). Create the actual URP project, pin its generated version/package files, integrate core, and prove Editor open/compile. Prototype empty-board camera readability.
2. Review the source and tests, then commit and publish to the chosen private GitHub destination using `docs/GITHUB_SETUP.md`. Verify a real Actions run before declaring CI passed.
3. Record iPhone model/iOS, iPad access, Apple membership/signing status, budget and deployment target. These do not block core foundation work; they remain unknown.
4. Review and approve the completed Stage 0 gate before Stage 1. Cloud iOS proof is required no later than Stage 3, not claimed here.

## Risks and limits

Core API targeting does not prove Unity/IL2CPP compatibility; JSON reflection needs device/AOT testing. The roll boundary intentionally stops at pawn resolution. The third-six policy requires caller-supplied next-player eligibility and is not yet wired into full turns. No durable idempotency storage, event wire codec, authentication, live RNG continuation or approved board layout exists. Open game rules are not silently resolved. Name/domain/trademark clearance remains unverified before paid branding/store metadata.

## Next Stage 1 ticket (after gate approval)

Implement deterministic Classic turn orchestration and legal pawn entry/movement against an explicit test board. Integrate third-six forfeit preserving both earlier actions. Resolve bonus/capture semantics with the owner before claiming complete rules. Add actual 6,6,6 / 6,6,5, save/reload, full event replay and wrong-turn tests, then expand toward captures, blockades and finishing behavior. Keep all 2–8 layout generation, UI and online systems outside this first narrow ticket.
