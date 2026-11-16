# Unity manual setup — NOT VERIFIED

No standard Unity installation was detected during kickoff. There is no generated Unity project in this repository yet.

1. Install Unity Hub, sign in and install a supported Unity 6.3 LTS patch. Record the exact version; install iOS Build Support where offered/required.
2. Create a Universal 3D (URP) project at `C:\Users\anzum\Desktop\LOODL\unity-client`. Confirm the template creates the project directly there, not in an extra nested folder. Preserve existing files if any appear before setup.
3. Open it in the Editor, select .NET Standard 2.1 API compatibility, use text asset serialization and visible metadata where supported, save, close and reopen.
4. Commit Assets and their .meta files, Packages/manifest.json, Packages/packages-lock.json and ProjectSettings including ProjectVersion.txt. These generated files pin actual installed Editor/package versions. Never commit Library or credentials.
5. Build the core Release DLL and integrate it as a managed plugin with its intended Unity import settings. Verify a minimal scene can construct and serialize a match. Confirm Console has no compilation errors; capture the Editor version and logs.
6. Prototype top-down/3D camera readability on an empty board, then record screenshots. This is pending Editor access.

Example batch smoke command only after a real Editor is installed (replace the patch placeholder):

```powershell
& 'C:\Program Files\Unity\Hub\Editor\<exact-patch>\Editor\Unity.exe' -batchmode -quit -projectPath "$PWD\unity-client" -logFile "$PWD\docs\unity-smoke.log"
```

Inspect the exit code and log for compilation errors. A batch invocation does not establish iOS compatibility, signing or device launch.
