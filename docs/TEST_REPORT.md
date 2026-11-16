# Stage 0 test evidence — 2026-10-14

## Executed

Local SDK: 10.0.402, installed in ignored `.tools/dotnet`. System `dotnet --info` initially reported no SDK. Git version: 2.38.0.windows.1.

PowerShell environment and exact test command:

```powershell
$env:DOTNET_CLI_HOME = "$PWD\.tools\cli"
$env:NUGET_PACKAGES = "$PWD\.tools\nuget"
$env:DOTNET_NOLOGO = '1'
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
& '.\.tools\dotnet\dotnet.exe' test tests/Core.Tests/Core.Tests.csproj --configuration Release --logger 'trx;LogFileName=core-tests.trx' 2>&1 | Tee-Object -FilePath docs/core-test-output.txt
```

Actual runner summary: **Passed 24, failed 0, skipped 0, total 24**. Test duration reported: 165 ms. Core and test assemblies compiled in Release without reported warnings/errors. Full console output: `docs/core-test-output.txt`. Local machine-readable result: `tests/Core.Tests/TestResults/core-tests.trx` (ignored generated artifact).

Coverage: participant counts 2–8 as state construction only; equal yard pawn counts; invalid identities/counts/locations; seeded dice golden sequence and range; invalid match/player/version without RNG consumption; invalid dice; phase rejection; snapshot round trip/schema rejection; single-roll replay and duplicate rejection; non-six reset; synthetic third-six preservation and out-of-turn rejection; OPEN capture interaction.

**These are foundation and policy tests, not full game-behavior tests.** No actual pair of pawn moves is executed before the third-six policy fixture. No full match, capture, layout fairness or full turn-sequence replay is implemented/tested.

Additional command:

```powershell
& '.\.tools\dotnet\dotnet.exe' restore tests/Core.Tests/Core.Tests.csproj --locked-mode
```

Passed with exit 0 when network access was available; output retained in `docs/locked-restore-output.txt`. Initial sandbox attempt failed NU1900 because the NuGet vulnerability service could not be reached; the successful retry did not disable auditing.

`git check-ignore` confirmed local SDK, core binary and generated test results are excluded. Local repository initialized on `stage0/foundation`. No initial commit or remote push performed.

`gh auth status` and `git ls-remote https://github.com/dotnet/samples.git HEAD` succeeded outside the sandbox. Initial sandbox authentication/network checks failed; that failure did not establish invalid credentials. No credentials were written to repository logs.

## Separate verification outcomes

| Area | Result |
|---|---|
| Pure C# build/tests | PASS — 24/24 |
| Locked dependency restore | PASS |
| GitHub connectivity/authentication | PASS |
| GitHub Actions execution | NOT RUN — workflow prepared locally |
| Unity Editor open/compile | NOT RUN — NOT VERIFIED; no standard installation detected |
| Cloud iOS build | NOT RUN |
| iOS signing | NOT RUN; membership/certificates UNKNOWN |
| iPhone install/launch | NOT RUN |
| iPad verification | NOT RUN |
| Server, multiplayer, IAP | NOT RUN — out of Stage 0 implementation scope |

Unity detection checked PATH, standard Hub/Editor paths and Windows uninstall entries. Custom-path installations remain possible. There is no checked-in Unity project or fabricated version/package pin.
