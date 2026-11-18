# Android and iOS apps

The apps wrap the same web game with Capacitor 8.6.0 (`apps/web/capacitor.config.ts`, app ID `online.loodle.app`). Native projects: `apps/web/android` and `apps/web/ios`. Icons and splash screens in both projects are the LOODLE design.

Inside the apps (`src/platform.ts`):

- Online play connects to `wss://loodle.online/ws`. The server accepts the app origins `https://localhost` (Android) and `capacitor://localhost` (iOS), so **the server must be deployed with this change before online play works in an app**.
- Invite links point to `https://loodle.online/?join=CODE`.
- Google sign-in is hidden: Google's web sign-in does not run inside an app. A native sign-in plugin is needed if accounts should work in the apps.
- The offline service worker is not used (the app already ships its files).

## Every change to the game

```bash
npm run app:sync
```

This builds the web game and copies it into both native projects.

## Android (works on Windows)

Needs Java 21 or newer. Android Studio's bundled Java works:

```bash
cd apps/web/android
JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./gradlew assembleDebug
```

Output: `apps/web/android/app/build/outputs/apk/debug/app-debug.apk`. `local.properties` (path to the Android SDK) is per machine and not committed; create it with `sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk` or open the project once in Android Studio.

Tested on 2026-11-18: the debug build installed and ran on the Pixel 10 Pro emulator (Android Studio's AVD); lobby, mode menu and a solo match worked. Not tested on a physical phone.

### Releasing to Google Play (owner steps)

1. Create an upload key (keep it and its passwords out of git):
   `keytool -genkey -v -keystore loodle-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload`
2. Add a release `signingConfig` that reads the keystore path and passwords from environment variables or a git-ignored `keystore.properties`.
3. Build the bundle: `./gradlew bundleRelease` → `app/build/outputs/bundle/release/app-release.aab`.
4. In Play Console (one-time $25 developer account): create the app, upload the bundle to internal testing first, fill in the content rating questionnaire, data safety form (match `apps/web/src/ui/Legal.tsx`) and the privacy policy URL `https://loodle.online/?page=privacy`.
5. Set `CONTACT_EMAIL` in `apps/web/src/ui/Legal.tsx`; both stores require a contact.

## iOS (needs a Mac)

The Xcode project is generated (Swift Package Manager, no CocoaPods) but has **not been built**: iOS builds need macOS with Xcode. Options for a Windows owner: a Mac, a rented cloud Mac (MacinCloud, etc.), or a CI service with macOS runners (GitHub Actions `macos-latest`, Codemagic). See also `docs/IOS_BUILD_RUNBOOK.md`.

On the Mac: `npm ci && npm run app:sync`, then `npx cap open ios` from `apps/web`, set the signing team, and archive. An Apple Developer account ($99/year) is required for TestFlight and the App Store.

The App Store icon (`AppIcon-512@2x.png`, 1024×1024) is written without an alpha channel, as Apple requires.
