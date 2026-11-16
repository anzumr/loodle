# Engineering decisions — 2026-10-14

- Preserve the three supplied v1.2 documents unchanged.
- Use a pure netstandard2.1 core with a separate net10.0 xUnit host. Pin SDK via global.json and test packages via csproj; lock restored dependencies before handoff.
- Use built-in DataContract JSON for Stage 0 snapshots. Device/AOT verification remains outstanding.
- Stage 0 only implements a roll boundary and isolated third-six policy. It does not resolve OPEN rules.
- No Unity Hub/Editor was found in PATH, standard installation directories or inspected Windows uninstall entries. This does not exclude a custom installation. Do not fabricate Assets/Packages/ProjectSettings or pin an uninstalled Editor patch.
- Use a local ignored `.tools/dotnet` SDK because the system dotnet installation has runtimes but no SDK.
- GitHub publication remains private by design. Do not create a public remote. CI configuration can be prepared locally without claiming a remote run.
- Cloud iOS builds are the selected pathway; no paid build setup, credentials or Apple account configuration is included.

UI sitemap: optional guest/profile setup → Home/PLAY → mode choice → match → results/Play Again. Primary destinations: Home, Collection, Ranks, Social. Full UI implementation is deferred.

Theme token proposal: semantic surface/text/accent/player-color/spacing/type/motion tokens; player identity must also use shapes or symbols. No art palette approved.

Target matrix: owner's physical iPhone (model/iOS UNKNOWN), iPad access UNKNOWN, minimum OS UNKNOWN. Early metrics proposal: first move time, match completion, reconnect success and crash-free sessions. Infrastructure budget and release timeline UNKNOWN; no paid services configured.
