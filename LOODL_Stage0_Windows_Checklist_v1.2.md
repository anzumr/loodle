# LOODL — Windows Stage 0 Setup Checklist v1.2
**Hardware confirmed:** Windows PC; iPhone; cloud iOS build permitted. No owned Mac assumed.
**Source of truth:** `LOODL_Production_Handoff_v1.2.md`.

## Step A — Local tools on Windows
- [ ] Download and sign in to Unity Hub: https://unity.com/download
- [ ] Install **Unity 6.3 LTS** from the supported LTS line; record the exact patch number. Add **iOS Build Support** if offered/needed; also install Visual Studio or use VS Code with C# support.
- [ ] Create **Universal 3D (URP)** Unity project named `LOODL` in a short path without unusual characters, e.g. `C:\Dev\LOODL\unity-client` (the full repo root would be `C:\Dev\LOODL`).
- [ ] Open the Unity project in the Editor and confirm no red Console errors. Save the project, close and reopen. Mark Editor as **NOT VERIFIED** until actually opened.
- [ ] Install Git for Windows and the current supported .NET SDK (`dotnet --version`). The Unity Editor and standalone .NET SDK may require different target API profiles; choose shared core compatibility deliberately.

## Step B — Repository and project hygiene
- [ ] Initialize **one repo** at `C:\Dev\LOODL`, not separately inside `unity-client/`.
- [ ] Suggested Windows Git Bash commands:

```bash
mkdir -p /c/Dev/LOODL
cd /c/Dev/LOODL
git init
git status
dotnet --info
```

- [ ] Make sure `.gitignore` excludes `unity-client/Library/`, `Temp/`, `Obj/`, `Logs/`, generated Builds, `.vs/`, and signing files (`*.p12`, `*.mobileprovision`, `*.p8`, `.env`). Track `Assets`, `Packages`, `ProjectSettings` and `.meta` files. Don't delete anything unless it is known safe.
- [ ] Add `docs/`, `src/Loodl.Core/`, `tests/Core.Tests/`, `ops/`. Keep `README.md` and `docs/PROGRESS.md` current.
- [ ] Set Unity asset serialization to Force Text and Meta files to Visible in Editor settings when supported, then document it.
- [ ] Create a **private** GitHub repo only after verifying local files; push initial commit.

## Step C — Codex first task
1. Open `C:\Dev\LOODL` as the Codex workspace.
2. Put `LOODL_Production_Handoff_v1.2.md` in `docs/` (or give it to Codex in the workspace).
3. Paste `LOODL_Codex_Stage0_Kickoff_v1.2.md` into Codex.
4. Require Codex to inspect before editing; run real tests and give commands, outputs and exact file list.
5. Review with `git diff` and `git status`; commit only when tests are verified.

## Step D — Stage 0 proof gate
- [ ] The correct Unity Editor version opens on Windows without blocking compile errors.
- [ ] `dotnet test` runs with a reported exact pass/fail/skip count; no claim is made for tests that aren't actually implemented.
- [ ] Pure C# core has no `UnityEngine` dependency and models deterministic game state transitions.
- [ ] `docs/RULEBOOK_DECISIONS.md` says **third-six forfeit AND retention of the first two legally completed moves are CONFIRMED**, while capture bonus interactions remain OPEN.
- [ ] Git ignore, repo, README, architecture, progress log and CI (if configured) are reproducible.
- [ ] `docs/IOS_BUILD_RUNBOOK.md` describes cloud builds, and iOS outcomes remain NOT RUN unless proved.
- [ ] No private keys, Apple credentials, Unity secrets, password files or repository tokens have been committed.

## Step E — iPhone build feasibility (plan in Stage 0; prove no later than Stage 3)
- [ ] Confirm whether Apple Developer Program enrollment already exists. Membership is needed for App Store distribution, Apple services and generally for cloud code-signing workflows.
- [ ] Plan an explicit Bundle Identifier (example only, **not reserved**: `com.yourstudio.loodl`).
- [ ] Connect private GitHub repo to Unity Build Automation and set correct project directory/editor version.
- [ ] Arrange signing certificate/private key, provisioning profile and device or App Store distribution setup. Unity's current documented `.p12` certificate workflow describes macOS Keychain, so determine whether temporary Mac access or a trusted signing provider is needed.
- [ ] Configure a minimal cloud iOS build, record logs, confirm signed app artifact, install on iPhone, record model+iOS version, launch + screenshot proof. Each of these must be separately demonstrated.
- [ ] Add iPad physical-device testing to release matrix; an iPhone alone cannot prove a good iPad experience.

## Still-open decisions (do not guess)
- **CONFIRMED:** a third consecutive six immediately ends the turn without a move; both previously completed legal moves remain committed. Do not treat first-two-move retention as open.
- After a capture bonus, does a consecutive-six counter persist or reset? Define before Stage 1 completion.
- Bonus stacking, blockades, exact finish, turn timer / disconnect and Quick Clash ranking remain to be resolved in the ruleset document.
- Apple Developer Program membership, iPhone model/iOS, target minimum iOS, budget and desired launch timeline remain unknown.

## Official sources
- Unity 6.3 LTS: https://unity.com/blog/unity-6-3-lts-is-now-available
- Windows iOS setup: https://docs.unity.com/en-us/engine/6000.3/manual/platform-specific/iphone/getting-started/ios-environment-setup
- Unity Build Automation: https://docs.unity.com/en-us/build-automation
- GitHub/source setup: https://docs.unity.com/en-us/build-automation/get-started-with-build-automation/connect-your-version-control-system
- iOS signing: https://docs.unity.com/en-us/build-automation/sign-build-artifacts/sign-an-ios-application
