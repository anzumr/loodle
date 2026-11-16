# LOODL — Product & Production Handoff v1.2
**Date:** October 14, 2026  
**Revision:** v1.2 — Locked first-two-move preservation after a third consecutive six; updated Stage 0/1 requirements and test gates  
**Status:** Planning specification / approved vision with explicitly marked open rules  
**Owner:** Independent developer building with AI coding assistants (Codex and others)  
**Working brand:** LOODL (pronounced “LOO-dul”); domain ownership and trademark clearance are not yet verified  
**Platform priority:** iPhone and iPad, iOS/iPadOS first. Future platforms are optional.  
**Confirmed development hardware:** Windows PC + physical iPhone; willing to use cloud macOS/iOS builds. No owned Mac confirmed.  
**Tagline/subtitle candidate:** Multiplayer Ludo Arena (working, not App Store-approved)  
**Guiding principle:** *One obvious Play button. Simple first, deep when invited.*

> **Handoff instruction:** Treat decisions labeled **CONFIRMED** as product requirements. Treat **PROPOSED** values and choices as defaults for prototyping, not permission to silently lock in unapproved game rules. Do not invent features or overclaim test status. Everything must be independently verified before release.

## 1. Product definition
LOODL is a premium-feeling, competitive yet approachable free-to-play multiplayer Ludo game. It modernizes Ludo through balanced 2–8-player arenas, optional fast modes, polished 3D collectible pawns, switchable 2D/top-down and 3D perspectives, progression, ranked competition, private rooms, a solo starter campaign, and cosmetic collections. The game must remain welcoming and instantly understandable to casual players. The competitive depth belongs underneath a simple surface.

### 1.1 UX non-negotiables — CONFIRMED
- Players can reach a match fast, without studying currencies, settings or cosmetic systems.
- One dominant **PLAY** action in the home lobby; no more than four primary navigation destinations: Home, Collection, Ranks, Social. Profile/settings live in the header.
- Initial account setup is brief; username/avatar can be skipped in favor of generated defaults.
- Advanced settings, profile cosmetics, board previews, and rule customization are revealed contextually, not forced into onboarding.
- No visual pay-to-win or functional advantage from purchased cosmetics.
- All public profiles are **minimal by default**, and players opt into sharing additional information.
- Adaptable LOODL brand: one recognizable logo structure with swappable styles for events, environments and skins; don't bind the base mark to a single ornate/fantasy/cultural look.
- Simple, well-contrasted controls, readable board at 2–8 players, responsive portrait/landscape layouts and accessibility options.

### 1.2 Player promise
1. Play offline, locally, or casual online quickly.
2. Invite friends, or progress toward online ranked play.
3. Collect cosmetics and develop a unique identity without learning complex systems.
4. Return for leagues, challenges, campaign chapters and eventually social/tournament depth.

## 2. Release scope and release boundary
### 2.1 Expanded public launch — CONFIRMED product target
- Playable and tested player counts **2, 3, 4, 5, 6, 7, 8** (including 5 and 7), primarily in offline, casual matchmaking and private/custom rooms.
- Classic Ludo; Quick Ludo with one pawn initially on the track, reduced track/time, and distinct Quick Race / Quick Clash configurations; 2, 3 or 4 pawns per player (equal within match).
- Balanced functional board layouts appropriate to player count; separate cosmetic board skins.
- Free-for-all, plus feasible equal-sized team formats in private/casual (2v2, 3v3, 4v4, multi-team as supported by count); team pawn-control variants defined before shipping.
- Offline single-player versus AI and offline local pass-and-play, five AI levels (Beginner/Easy/Medium/Hard/Expert) and optional adaptive challenge that NEVER manipulates dice probability.
- Casual live online; private rooms with join codes and invitations; essential custom rule presets; disconnect/reconnect support; optional casual AI backfill.
- Limited ranked queues for population health: prioritize linked-account Solo 1v1, 4-person FFA, and 2v2 Teams; separate rating/leaderboards.
- Guest casual online access; account linking required for ranked and advanced social. Guest account upgrade must preserve existing valid progress.
- Username, stable player ID and friend code; player profiles; collectible avatars OR generated portraits of owned 3D pawns; earnable frames and optional premium styling variants; simple static banners, preset statuses and titles only; minimal public profile defaults.
- Clean customizable lobby; 3D pawns, dice/board cosmetic styles, showroom/inspection; camera switch between readable top-down and 3D view.
- Coins, permanent XP/levels, starter achievements/challenges, appropriately reduced offline rewards, starter story campaign with named AI rivals.
- Cosmetics inventory and shop; optional real-money premium cosmetics and board skins using correctly verified Apple in-app purchases; restoring owned items.
- Friends, invitations, basic social protections and moderation for any user-generated text made available at launch.
- Match results and full finishing order up to eighth place; spectate/leave after finish.
- Apple compliance, physical-device testing, accessibility, account deletion, privacy policy, support, anti-cheat/abuse controls.

### 2.2 Stage for post-launch, not a reason to delay core play
Full clubs (small, private, up to 20 users), officers and club missions; elaborate tournaments/brackets and multi-day qualifiers; replay viewer and highlight clips; full advanced custom rules; Battle Pass seasons, seasonal community events, extensive campaign chapters, Power-Up Ludo and other experimental modes; animated profile backgrounds; complex avatar FX; gifting; elaborate Desi-themed premium board pack details. **Desi board designs are intentionally deferred — do not invent or lock them in.**

### 2.3 Cutline discipline
If cost/schedule threatens quality, do **not** ship unsafe multiplayer, broken account linking or inconsistent rules. Cut **polish/content breadth** first: extra models, detailed animations, number of campaign chapters, avatar effects, extra ranked queues, advanced rule presets. A smaller complete game beats a sprawling unstable launch. Changes to the expanded launch promise require owner approval.

## 3. Product systems / game rules
### 3.1 Classic foundation — CONFIRMED
- A six is needed to bring a pawn into play in Classic Ludo.
- Traditional safe squares; players can capture opponents on legal unsafe squares.
- Rolling a six and performing a capture qualify for extra-turn behavior, with precise stacking pending rulebook approval.
- Two same-owner pawns can form a blockade; pass-through, dissolution and teamwork exceptions must be explicit.
- Finish order continues until standings are determined for all participants.
- Equal pawn count per player within any match: 2, 3, or 4 selected by mode/host.
- **Three consecutive sixes — CONFIRMED:** on the **third consecutive dice roll of six by the same player within the active bonus-turn sequence**, the player's turn immediately ends. The third six cannot be used to enter or move a pawn and does not grant another turn. Count successive sixes per player during that player's continuous turn sequence; reset the counter when a roll is not six or when turn control passes to another player. **CONFIRMED:** legal pawn moves already committed after the first and second sixes remain valid on the board; do not roll them back because of the third six. After the third six, pass control to the next eligible player and reset the streak. Never consume a client-supplied dice result in online play.
- Dice are random and fair; ranked dice and moves are generated/validated server-side, never based on client claims.

### 3.2 Rulebook decisions that require sign-off before Stage 1 ends
- **Triple-six consequences — fully CONFIRMED:** The third consecutive six ends the turn, yields no pawn action or bonus, and **does not undo either of the two earlier legally completed moves**. No further owner sign-off is required on first-two-move preservation. **Still OPEN:** whether six/capture bonus turns stack or cap, and whether a capture-triggered bonus interrupts or carries forward the consecutive-six chain.
- Can two pawns on the same square form a blockade on all layouts? Can a teammate pass it?
- Exact capture behavior on safe squares, home lanes, entry squares and team-owned pieces.
- Exact-roll requirement to reach finish, turn order after someone finishes, multi-capture rewards.
- How team pawn ownership and selection operate in shared-team-pawn mode.
- Timeout behavior (auto-move, skip, surrender), disconnection grace periods, ranked forfeit conditions.
- Quick Race vs Quick Clash scoring and tiebreakers. Ensure timer-limited matches finish an equal-turn-count round.
- Approved numbers and topology for each board layout. Path symmetry and fairness are properties to test, not merely promise.

### 3.3 Draft defaults to facilitate a prototype — PROPOSED
- **CONFIRMED (not a prototype assumption):** A roll sequence of 6 → 6 → 6 in the same continuous turn ends immediately on the third roll, creates no third-roll move or extra turn, and preserves all legal changes from the first two rolls. Do not revert pawn positions, captures or other committed actions from those first two rolls.
- At most one next bonus turn per resolved roll/action, never unbounded bonus stacking.
- Exact roll needed to enter final home square.
- Ranked: uniform standardized board/rules with cosmetic-only themes; no host-defined gameplay advantage.
- All custom presets carry ruleset version IDs and are visible before match start.
- For an unknown tie, do not silently randomize rank; define deterministic tie procedure in approved ruleset.

### 3.4 Functional layouts vs skins
**Board layout:** topology/track length/start positions/safe squares/capture geometry; mathematically and statistically evaluated for seat advantage. **Board skin:** art, materials, VFX, ambient effects; no gameplay effect. A private room host can select a skin every player sees, even if visitors do not own it. Players do not gain asset ownership from seeing it. In ranked, layout and rules are fixed by queue.

## 4. Navigation, signup and player profiles — CONFIRMED
### 4.1 Screen map
- First run: splash -> Play as Guest / Continue with Apple -> optional nickname and avatar -> tutorial or Play -> Home.
- Home: oversized PLAY, friends/solo shortcut, profile/coins/settings header; at most Home, Collection, Ranks, Social bottom destinations.
- PLAY opens concise mode sheet: Casual/Classic, Quick, Ranked, Private Room, Solo; advanced rules behind 'Customize'. Remember last-played mode.
- In-match: board visually dominant, dice and legal moves obvious, turn timer and player order legible; compact camera switch and pause/mute. Avoid persistent shop and social UI over the board.
- Match end: placement, wins/captures, XP/coins, single Play Again action; secondary return/share; no cascading pop-ups.
- Profile: avatar, nickname, tag, selected title/status and simple banner. Show public rank/stats/achievements/history/club/online status only if enabled in privacy settings.
- Collection: one-tap equip for pawn/board/dice/avatar, with deeper Avatar Studio and full 3D showroom one level down.

### 4.2 Authentication
- Guest account created anonymously. Guests can play offline and casual online; ranked and advanced social require account linking.
- Link to Sign in with Apple (primary iOS path), consider Game Center / Google as additional supported providers after SDK/platform review.
- Distinct stable `playerId` + mutable `displayName` + disambiguator/tag + permanent friend code.
- Generated nickname and avatar are allowed; chosen nicknames validated server-side with profanity/impersonation controls and rename cooldown (exact limit TBD).
- Account-link conflict screens must not overwrite either guest or existing linked profile, inventories or purchases. Do not merge accounts automatically.
- Guest loss-of-device risks explained at natural moments; linked account supports recovery across devices.
- Settings: identity, linked providers, privacy, block/report, purchase restoration, help, account deletion, privacy/terms links.

### 4.3 Avatar & profile customization
- Select independent **collectible illustrated avatar** or **portrait of an owned 3D pawn**; user chooses either anytime.
- Portrait studio options after onboarding: pawn model, allowed pose/camera crop, still background and earned frame. Optional 'follow equipped gameplay pawn' vs frozen snapshot; cache still thumbnails for leaderboards/chat.
- Every avatar frame must have a reasonable earnable acquisition path; premium styling variations may exist. No paid gameplay effects.
- Simple static banners at launch; presets for status and earned titles, no editable free-text bio.
- Minimal-public privacy is default, including hiding rank, detailed stats, matches, achievements, online status, club and social details unless user opts in; apply child/teen restrictions as required.
- Uploaded personal photos are not part of initial launch (reduce moderation and privacy exposure).
- Friends/match participants may see necessary identifiers and match data for fair play; define such exceptions explicitly in privacy specification.

## 5. Technical architecture
### 5.1 Recommended baseline
- **Client:** Unity 6.3 LTS, C#, URP, iPhone/iPad with portrait/landscape layouts; test on actual devices. Pin stable Unity/package versions in source control.
- **Pure rules engine:** a UnityEngine-free C# library with deterministic transitions and unit tests, reused by offline AI, UI simulation and online server logic. Do not put rules in UI MonoBehaviours.
- **Auth:** Unity Authentication anonymous plus linked Apple/provider identities.
- **Match discovery/presence:** Unity Multiplayer Services SDK (`com.unity.services.multiplayer`) for Lobby/Matchmaker/Relay-backed sessions as needed; avoid starting with deprecated standalone packages.
- **Authoritative turns/persistence:** evaluate Cloud Code C# modules + Cloud Save game-state records (with write locks/version checks) and push/realtime updates. For actual live turn timers, compare Stateful Cloud Code timer facilities vs a dedicated authoritative match worker. **Architectural spike required**: prove capacity, reconnect, timer accuracy, ordering and cost on a 2- and 8-player prototype before committing.
- **Game data:** Cloud Save / protected server records for progression and inventory, Economy and Leaderboards where appropriate; clients cannot directly write scores, currency or ownership.
- **Payments:** Unity IAP compatible with Apple StoreKit, server-side transaction verification, entitlement restoration and idempotent grant.
- **Social/chat:** use an appropriate moderated messaging provider or custom service *only after* assessing moderation/reporting/blocking/retention/abuse needs. Do not expose unmanaged public chat.
- **CI/CD:** GitHub, automated C# and Unity tests; **CONFIRMED Windows-first** development. iOS build pipeline through **Unity Build Automation running macOS/Xcode in the cloud**, plus Apple developer signing and TestFlight when eligible. No local macOS/iPhone build is assumed to work on Windows.
- **Physical test device:** the owner has an iPhone, to be used for real-device builds and usability/performance testing once cloud signing is configured. iPad physical hardware is not yet confirmed; arrange real iPad testing before iPad release.
- **Cloud-build prerequisite risk:** confirm Apple Developer Program membership, bundle ID, certificates/private key (.p12 or current accepted credential flow), provisioning profiles, and safe secret storage. Unity's signing guide describes macOS Keychain steps for creating signing assets, so absence of a personally owned Mac does **not** prove signing can be configured without any temporary Mac/signing support. Resolve during the first iOS feasibility spike; do not put .p12 files, signing passwords or provisioning secrets in Git.
- **iOS feasibility gate (no later than Stage 3):** create, sign and install a trivial iOS smoke build from the checked-in Unity project on the owner's iPhone, before investing heavily in final art/netcode. Distinguish cloud build success, successful signing, and actual device launch as three different proofs.

### 5.1a Confirmed Windows-to-iPhone toolchain — CONFIRMED
1. **Windows:** Unity Hub + a pinned Unity 6.3 LTS Editor version, URP template, VS Code/Visual Studio with C#, Git, .NET SDK and local `dotnet test` runner. Add iOS Build Support module through Unity Hub where required. Development and rule tests run locally.
2. **GitHub:** private repository with Unity-safe `.gitignore`, text/visible meta files, pinned Unity/packages, no Apple or Unity secrets, clean commits and repeatable CI tests.
3. **Cloud build:** configure Unity Build Automation, link the Git repository, set a dedicated iOS build target with the exact Unity version and an Apple bundle identifier. Provision Xcode/signing credentials through secure Build Automation settings and test a minimal iOS build.
4. **iPhone:** install and open the signed test app; record device model, iOS version, launch result, orientation, crashes and performance. Later use TestFlight for broader testing when developer distribution is ready.
5. **Evidence:** local unit-test logs are not proof of a cloud build; a generated Xcode project is not proof of a signed `.ipa`; a signed `.ipa` is not proof that the app installed/launched on the owner's phone. Record all separately.

### 5.2 Repository layout (proposal)
```
loodl/
  docs/             # GDD, ruleset decisions, UX, design tokens, contracts, changelog
  unity-client/     # Scenes, UI, 3D assets, presentation, platform glue
  src/
    Loodl.Core/     # Pure game state machine; no UnityEngine
    Loodl.Layouts/  # Board topology, fairness simulation
    Loodl.AI/       # AI policies using core state
    Loodl.Contracts/# DTOs, schema versions and action definitions
    Loodl.Backend/  # Auth endpoints, match lifecycle, matchmaking adapters
  tests/
    Core.Tests/
    Layout.Tests/
    Backend.Tests/
    Simulation.Tests/
  ops/              # UGS/IAP configs, CI, secret management, monitoring
  tools/            # Simulation, test data, replay-log inspector
```

### 5.3 Authoritative action contract
Every action includes `matchId`, `playerId` from verified auth, `actionId` idempotency token, `expectedStateVersion`, and typed intent (`Roll`, `EnterPawn`, `MovePawn`, `Leave`, `Reconnect`). The server validates seat, turn, phase, dice, pawn, layout, timing and legal destination; applies transition once; persists atomically/version-checked; emits ordered update; records events sufficient to reproduce disputes. On retries, return the prior outcome or reject safely. No double reward, duplicate turn or client-created dice. Never store credentials in client code or repository.

### 5.4 Nonfunctional requirements
Offline works without connectivity after install; offline rewards have fraud-resistant syncing/limited earning and no inflated leaderboards. Good performance on modest recent iPhones, graceful low-power graphics mode, color-blind-safe pawn differentiation, reduced-motion option, dynamic readable text, meaningful audio/haptic feedback, localized-ready string tables, connection loss UX, server observability with privacy-respecting logs and user-facing error states.

## 6. Production stages with acceptance gates
### Stage 0 — Preproduction, decisions and repo (deliverable: signed MVP specification)
**Build:** Unity **6.3 LTS on Windows** URP project, Git repository (private GitHub preferred), CI, test runner, ruleset reference document including **confirmed third-six forfeit**, board topology format, UI sitemap, theme token system, target-device matrix listing the owner’s iPhone, early telemetry and rough infrastructure budget. Record Build Automation as the chosen iOS build pathway, but do not demand a signed iOS build yet. Verify LOODL name, domain and trademark availability before committing to paid branding or App Store metadata. Prototype both top-down and 3D camera readability on an empty board when Editor is ready.
**Exit gate:** Pinned Unity Editor opens project **on Windows**, C# test suite executes locally and in CI, repo branches/config documented, **triple-six forfeit explicitly tagged CONFIRMED**, remaining rule ambiguities approved or explicitly provisional, and cloud-iOS signing checklist created. No critical secrets checked in. **Do not mark iOS build verified** at Stage 0 unless separately built and launched on device.

### Stage 1 — Pure rules engine (deliverable: deterministic headless Classic Ludo)
**Build:** GameState/PlayerState/PawnState, dice/RNG interface, turn phases, legal moves, entering, capture, safe squares, blockades, bonus turns, **third-consecutive-six turn forfeiture**, win/finish ordering, rulesets, serialized event logs and schema migrations. Mock deterministic dice for tests; cryptographic fair randomness for authoritative server. Maintain a per-active-turn consecutive-six count, reset it on any non-six, and forbid movement/bonus after the third six. Preserve the first two legally committed moves after a third six. Resolve the still-open capture-bonus/chain interactions before final Stage 1 rule tests.
**Exit gate:** Thousands of seeded headless matches do not hang; hand-authored corner cases pass; replay of action log reproduces state; no UnityEngine dependency; no illegal move/state mutation accepted.

### Stage 2 — 2–8 balanced layouts and modes (deliverable: validated 2D board simulator)
**Build:** layout generator/data for 2–8 players including 5/7; each starting lane/path/safe square mapping; alternate layouts; 2/3/4-pawn modes; Quick one-pawn-start, Quick Race/Clash; FFA/team modes and parameterized rule variants.
**Exit gate:** Layout invariant tests (path reachability, equal path distances, no overlapping invalid nodes, turn ordering); large Monte Carlo seat-bias simulation with identical AI policies; publish fairness report and acceptable thresholds; owner signs off any structural asymmetries. Test unusual 5/7 layouts rather than assuming traditional four-color board works.

### Stage 3 — Offline vertical slice and simple UX (deliverable: first playable game)
**Build:** touch-driven board, dice feedback, legal-move highlighting, player HUD, match results, main lobby with oversized PLAY, mode selection, pause, local pass-and-play, placeholder pawn assets, switchable top-down/3D camera. Use placeholder art until rules prove playable. **Windows/cloud iOS smoke milestone:** before declaring this stage complete, generate and sign an iOS build in the cloud and prove it launches on the owner’s iPhone (or explicitly document and resolve the signing/build blocker).
**Exit gate:** 2–8-player offline complete games from start to final standings; first-time player reaches first move without tutorial confusion; readable on a small iPhone; portrait/landscape layouts tested; no unsupported UI options exposed.

### Stage 4 — AI and starter content (deliverable: compelling offline loop)
**Build:** Beginner/Easy/Medium/Hard/Expert AI policies, AI strategy heuristics, offline guided academy, first story chapter(s), named rival personas and starter cosmetic rewards, local save/restore.
**Exit gate:** AI always makes legal moves within deadlines; difficulty feels measurably different without tampering with dice; campaign can be completed offline; no save corruption on app termination.

### Stage 5 — Online networking spike and full multiplayer (deliverable: reliable authoritative match)
**Build:** anonymous identity integration, lobby discovery/private room codes, casual matchmaking, authoritative action handler, state versions/write locks, turn timer backend, ordered updates, reconnect snapshots, spectator state, disconnect AI takeover/reclaim for casual, online 2–8 players, FFA/team match variants. Verify provider/service costs against expected traffic. Use push where appropriate; no client-hosted authority for competitive outcomes.
**Exit gate:** Two and eight clients play full matches across network drop/restore; injected duplicated, stale, simultaneous and illegal commands do not corrupt state; timing/forfeit tests pass; abandoned-room cleanup works; latency/disconnect test reports captured.

### Stage 6 — Signup, profile, privacy and core social (deliverable: persistent player identity)
**Build:** guest-first onboarding; optional nickname/avatar choice; account linking, recovery/conflicts; immutable IDs, friend code, basic invites/friends; private-by-default public profiles; collectible avatar/3D portrait selection; frames/flat banners/preset titles; block/report controls and moderation service if messaging is enabled; deletion workflow.
**Exit gate:** Anonymous-to-linked upgrade preserves all valid progress; two-account conflict cannot overwrite data; profile privacy checked via backend auth (including a different player requesting data); default hidden stats cannot be queried; account deletion can be initiated in-app.

### Stage 7 — Progression and ranked (deliverable: fair competitive loop)
**Build:** XP/level, coin economy, modest offline rewards and anti-farming, starter achievements/daily-weekly tasks, linked-account-ranked Solo 1v1 / 4-player FFA / 2v2 with independent ratings, seasonal leaderboard scaffolding, penalties for disconnects, post-match rewards with idempotency.
**Exit gate:** Client tampering cannot create coins/ratings/achievements; ranked queues always use standardized approved rules; match cancellation/forfeits/rank tiebreaks tested; no duplicate reward grants after retries.

### Stage 8 — Final art, 3D showroom and cosmetics (deliverable: premium visual identity)
**Build:** finalized adaptable LOODL logo as vector + clean wordmark/app icon; original 3D pawn families, animation library, camera modes, board skins, dice, accessible VFX/audio, purchase/equip flows and asset streaming budgets. Maintain distinct functional board layout and cosmetic board skin IDs. Host-selected skin is visible to all match participants.
**Exit gate:** Cosmetic ownership never changes rule calculations; memory/rendering stable on low-end target hardware; everyone sees the host's theme without entitlement leakage; 3D thumbnails have fast static fallbacks; theme readability remains compliant.

### Stage 9 — Starter campaign + store / IAP (deliverable: launch content and commerce)
**Build:** polished starter campaign, story rival art/dialogue, reward economy balances, cosmetic catalogue, earnable/free skins, optional premium boards/pawns/dice, Apple IAP verification/restoration/refunds/entitlement reconciliation, purchase failure paths and parental controls where required.
**Exit gate:** Purchases work in sandbox/TestFlight and restore across linked devices; duplicate receipts/refunded purchases handled correctly; premium purchases have no gameplay benefit; all advertised items and prices match storefront configuration; no invented Desi pack details.

### Stage 10 — Beta, compliance and launch (deliverable: App Store-ready iOS/iPadOS app)
**Build:** tutorial polish, audio/accessibility, 2–8 player stress/load tests, battery/memory audits, crash analytics, rate limiting/anti-abuse, privacy disclosures, App Store assets and age rating, terms/privacy, in-app account deletion, functional support, TestFlight testing with novice and experienced users.
**Exit gate:** P0/P1 bugs closed; fair dice audit and authoritative replay proofs retained; no critical data loss; honest App Store screenshots; required social safety features work; launch rollback and hotfix plan exists; performance measured on real iPhones/iPads; known issue register signed off.

### Stage 11 — Post-launch growth (not initial release blockers)
**Build by data priority:** private clubs (<=20 members), club XP and missions, expanded seasonal events and battle pass, tournament formats, richer story chapters, Power-Up Ludo with fair symmetrical loadouts, replay/highlight sharing, more cosmetic collections and event-specific theme skins, later advanced banner/profile effects. Ship one independently testable feature slice at a time.
**Exit gate:** Changes do not regress core Ludo, fair matchmaking, existing entitlement ownership, privacy defaults or lobby simplicity. Feature flag/rollback support where feasible.

## 7. Definition of Done for *every* stage
1. Scope implemented and documented in code + changelog; **no hidden placeholders passed off as complete**.
2. Automated tests added for normal, edge, failure and replay cases, executed and actual commands/results recorded.
3. No new critical compiler warnings, test failures or dependency conflicts. Record unresolved issues plainly.
4. User flows reviewed on actual device where applicable (not screenshots alone).
5. Client data access, abusive inputs and privacy reviewed for any new backend feature.
6. Follow one source of truth for state, rewards and rulesets; no forked duplicate rules in Unity scene scripts.
7. Owner or reviewer explicitly approves the acceptance gate before next stage.
8. Save build artifacts, screenshots/video, test logs and reproduction steps for the next AI assistant or developer.

## 8. Test matrix and risk register
### Critical test cases
- 2/3/4/5/6/7/8 players; 2/3/4 pawns; multiple layouts; Classic/Quick; multiple team formations; finishing order ties.
- Triple six (script rolls `6,6,6`: after two valid committed moves, third roll **must not move any pawn**, earlier moves **must remain**, the turn **must pass** and the streak **must reset**); verify `6,6,5` streak reset, out-of-turn action rejected after forfeit, serialization/replay preserves both first-two moves, and reloading after two sixes then rolling a third still forfeits without rollback. Also test capture+six interactions, blockades, exact finish, simultaneous disconnect/reconnect, duplicate action and stale version, and finish/extra-turn edge cases.
- Offline app suspended mid-move; saved game loaded after version update; offline rewards synced after reconnect; account linking with existing account and with missing guest token.
- Ranked result issued twice, transaction processing twice, asset equip without ownership, host chooses premium skin for participants who do not own it.
- Five- and seven-seat fairness simulation and human readability.
- Eight-player low-memory UI, phone rotation, reduced motion, one-handed controls, colorblind accessibility.
- Chat moderation and privacy access, report/block, deletion request and support.

### Highest risks / mitigation
| Risk | Mitigation |
|---|---|
| Overambitious solo launch | Strict stage gates, functional vertical slice first, defer content extras |
| 5/7/8 player layout imbalance | Formal track model + seat-bias simulations early |
| Realtime turns/timers/races | Backend architecture spike, atomic versioning, idempotent actions, real network tests |
| Guest account loss/conflicts | Link-first nudges for ranked/purchases; transparent recovery and no silent merges |
| Player-base fragmentation | Few ranked queues at launch; broader counts in casual/private |
| Cosmetic or currency exploits | Server-owned inventory, purchase verification, no client-written balance |
| Confusing feature overload | 1 dominant home Play action; progressive disclosure; 5-user usability test per milestone |
| Apple rejection/moderation exposure | Privacy/deletion/UGC/IAP reviewed before external beta |
| Windows-only local build environment | Early cloud iOS build/signing spike; arrange signing support if Keychain or Apple certificates require macOS access |
| AI-generated code quality overclaims | Proof-of-work gate; exact test counts/logs, no invented success claims |

## 9. Visual / content principles
- Base LOODL logo and app icon must be legible in monochrome, tiny icon size and themed skins; preserve signature geometry.
- Game resembles a premium, accessible arena game, not a clone of any existing title. Bold original typography and friendly 3D art; no copied Clash Royale icon/crest/character artwork.
- Cosmetic categories: board skin, pawn skin, die skin, avatar, frame, simple banner, preset title, later effects. Cosmetics earnable or optional paid with no gameplay power.
- Main match view must always favor accurate board information, safe-square readability, turn order and legal moves over animations.
- Story rival personalities and art are original, with named rivals; dialogue optional/skippable.
- Desi premium board pack visual details expressly deferred by owner.

## 10. Metrics, instrumentation and operational readiness
Measure first-launch-to-first-move, tutorial skip/completion, match completion, queue wait times, reconnect success, crash-free sessions, retention D1/D7/D30, average duration by mode/count, mode usage, ranked abandonment, guest-to-link conversion, shop purchase completion/refunds, cosmetics equip rate, help/moderation incidents. Collect the least user data necessary and honor platform consent and privacy rules. Create environments Dev/Staging/Production; separately keyed service secrets; dashboard monitoring and alerts; cost ceilings; backup/restore and emergency maintenance procedures.

## 11. AI-assisted development instructions
- Work **one stage / narrow ticket** at a time. Ask for actual source files, not only textual plans. Never refactor unrelated modules unless necessary and explained.
- Start every ticket by inspecting the repository and identifying exact files owned/affected; preserve user changes.
- Show acceptance criteria before coding, implement with tests, run tests, capture output, summarize changes and known limits.
- If the environment cannot run Unity, iOS, UGS deployment or Apple IAP, mark the relevant tests **NOT RUN** rather than inferring success from a compile or mock.
- Use Git feature branches and small commits, lint/format automation and tests as check-in gates.
- Do not embed service API keys, Apple secrets or cloud service credentials in chat, code or logs.
- Never claim full correctness from a small test suite; distinguish unit, simulated, integration, real-device and production evidence.

### First Codex kickoff ticket (Stage 0)
**Goal:** Bootstrap LOODL's repository and the tested pure-C# rules-engine skeleton, without building the whole game.

**Deliverables:**
1. Unity 6.3 LTS URP project layout and Git ignore / version pinning.
2. A pure `Loodl.Core` C# assembly: immutable or controlled `MatchState`, `Player`, `Pawn`, `TurnState`, `Ruleset`, typed player action, game event and RNG injection interfaces.
3. NUnit/xUnit tests for state initialization, deterministic seeded dice adapter, JSON round trip, rejection of wrong-turn actions, and replay of example action log.
4. `docs/RULEBOOK_DECISIONS.md` marking BOTH **third-consecutive-six forfeit** AND **first-two-move preservation** as **CONFIRMED**; only capture-bonus streak interactions and other separate rule variants remain open. No mistaken "triple six TBD" comments.
5. CI command instructions for dotnet core tests; Unity-specific smoke test commands if the environment supports them.
6. `README.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/PROGRESS.md` and actual test report. Include a **Windows → GitHub → Unity Build Automation → iPhone** runbook with explicit prerequisites and NOT RUN status for unverified iOS tests.

**Non-goals:** online networking, full 3D graphics, payment integrations, store, ranked ladders, all 8-player layout generation. These begin later.

**Exit requirement:** run the tests and report exact outputs. Never say the Unity editor/iOS build works without verifying it.

## 12. Outstanding owner decisions (none should block Stage 0)
1. **Core rule variants:** **third consecutive six forfeits turn AND first two completed moves remain on the board are CONFIRMED**. Resolve only remaining issues such as bonus stacking/capture interaction, blockade/team passage, exact finish, timeout and Quick Clash tiebreaks by end of Stage 1.
2. **Aesthetic reference and original art:** approve base logo masters/app icon, starter pawn style, target board visual; no need to finalize every cosmetic.
3. **Online timeout / ranked policy:** select casual/ranked turn time limits and surrender grace after engineering spike.
4. **Monetization:** approve starter shop categories, specific IAP price points, if/when rewarded ads exist, and Battle Pass timing later. No monetization assumptions should alter game fairness.
5. **Release target constraints:** Windows + iPhone + cloud iOS build path is **CONFIRMED**. Still decide approximate budget, target release horizon, Apple Developer Program status, minimum iOS deployment version, iPhone model/OS, actual iPad access, and certificate provisioning route (which may require temporary Mac or signing-service support).
6. **Expanded launch sequencing:** confirm whether full team variations and the 2–8 player family are hard launch gates (assumed YES) and how much art/campaign content may be reduced before launch if testing demands it.

## 13. References / verification points (checked October 14, 2026)
- Unity 6.3 LTS: https://unity.com/blog/unity-6-3-lts-is-now-available
- Unity 6.3 iOS environment setup (Windows / cloud alternative): https://docs.unity.com/en-us/engine/6000.3/manual/platform-specific/iphone/getting-started/ios-environment-setup
- Unity Build Automation: https://docs.unity.com/en-us/build-automation
- Unity Build Automation Git integration: https://docs.unity.com/en-us/build-automation/get-started-with-build-automation/connect-your-version-control-system
- Unity iOS signing prerequisites: https://docs.unity.com/en-us/build-automation/sign-build-artifacts/sign-an-ios-application
- Unity Multiplayer Services SDK / unified package: https://docs.unity.com/en-us/mps-sdk/index
- Unity Authentication anonymous and linking: https://docs.unity.com/en-us/authentication/approaches-to-authentication
- Unity Cloud Code authoritative state: https://docs.unity.com/en-us/cloud-code/game-state-management
- Cloud Save write locks: https://docs.unity.com/en-us/cloud-save/tutorials/cloud-code
- Cloud Code timer choices: https://docs.unity.com/en-us/triggers/overview
- Unity Cloud Code access control: https://docs.unity.com/en-us/cloud-code/server-access-control
- Apple account deletion: https://developer.apple.com/tw/help/app-review/guideline-reference/5-1-1-account-deletion
- Apple Sign in with Apple guidance: https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple
- App review guidelines: https://developer.apple.com/app-store/review/guidelines/

---
**Change control:** v1.2 supersedes v1.1 (and v1.0). This document is the source of truth for scope until superseded by an explicitly approved newer version. A product decision is not final merely because an AI assistant suggested it. Change one clearly labeled area at a time, keep a changelog, and retain proven builds.


## Appendix A — v1.2 decision log (October 14, 2026)
| Item | Status | Product / engineering consequence |
|---|---|---|
| Windows PC for LOODL development | **CONFIRMED** | Use Windows Unity Editor, local .NET tests, GitHub source control |
| iPhone physically available | **CONFIRMED** | Require actual iPhone smoke build once signing is set up; test on-device before release |
| Cloud-based macOS iOS builds acceptable | **CONFIRMED** | Prefer Unity Build Automation instead of assuming owner has local Xcode |
| Third consecutive six forfeits turn | **CONFIRMED** | Immediate turn end and no move/extra turn from third 6 |
| First two moves persist after third six | **CONFIRMED** | Keep all lawful first/second-six pawn moves and other committed changes; third roll does not cause rollback |
| Capture bonus effect on consecutive-six streak | **OPEN** | Define exact dice-chain semantics before Stage 1 release |
| Apple Developer Program / cert availability | **UNKNOWN** | Do not claim iOS Build Automation can already sign or distribute builds |

### Stage 1 locked rules acceptance contract (owner-approved)
- Given a deterministic active-turn dice sequence `6, 6, 6` and two valid pawn actions committed after the first and second sixes, the third six **immediately forfeits the remainder of the turn**.
- The third six causes **zero pawn entries or movements**; any attempted pawn action attached to that roll is rejected. It does not award a fourth roll.
- The pawn positions and all other legal game-state changes committed before the third roll remain intact; the engine must **not undo the first two actions**.
- The turn advances to the next eligible player and the consecutive-six streak is reset for the new turn.
- Tests must also cover saving/reloading just before the third roll, deterministic event-log replay, and the fact that the forfeiting player cannot act out of turn.
- The handling of a **capture-generated extra turn and its interaction with this sixes streak** is a separate OPEN rules question. Do not invent an answer during Stage 0.

### Stage 0 safety boundary
Stage 0 creates the repository, editor project, documentation, library contracts, and demonstrably running tests; it does not deliver a playable match, server infrastructure, a signed iPhone build, or shipped social/purchase features. A valid Stage 0 report must explicitly say **NOT RUN** for any unexecuted Unity Editor, cloud iOS, device, server or IAP checks.
