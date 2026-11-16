# Windows → cloud → iPhone

Status: cloud build NOT RUN; signing NOT RUN; iPhone install/launch NOT RUN. Apple Developer membership and signing assets UNKNOWN. No local Xcode installation is assumed.

1. Complete the real Unity project setup and private GitHub push. Record Editor patch, packages and source commit.
2. Confirm Apple Developer membership, bundle identifier, iPhone model/iOS, deployment target and access to signing assets. Example identifiers are not reserved identifiers.
3. With owner authorization for paid resources, connect the private repository to Unity Build Automation. Set project directory `unity-client`, exact Editor version and iOS target on cloud macOS/Xcode.
4. Arrange signing certificate plus private key and provisioning profile through secure service settings. Determine whether temporary Mac/Keychain access or trusted signing assistance is needed. Never store .p12/.p8/passwords/profiles in Git.
5. Build a trivial smoke app first. Retain cloud job ID, commit, logs and artifact metadata. Verify signing independently of compilation.
6. Install on the physical iPhone via the chosen supported provisioning/distribution route, or TestFlight when eligible. Record model, iOS, installation result, launch screenshot, orientation behavior and any crash logs.
7. Prove this pipeline no later than the Stage 3 gate. Arrange separate physical iPad testing before iPad release.

Evidence is separate for C# tests, Windows Editor compilation, cloud build, signing, install and launch. None substitutes for another. Do not upload credentials to this chat.

Reference links supplied by the handoff (recheck current provider instructions when configuring services):
- https://docs.unity.com/en-us/build-automation
- https://docs.unity.com/en-us/build-automation/sign-build-artifacts/sign-an-ios-application
- https://docs.unity.com/en-us/build-automation/get-started-with-build-automation/connect-your-version-control-system
