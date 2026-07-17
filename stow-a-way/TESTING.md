# Testing Stow-a-way

Two ways to run the app: **Expo Go** (fastest, for iterating) or a **standalone
build** (a real install, closest to the store version).

## Prerequisites

- Node 18+ on your computer
- An Android phone (or the iOS/Android simulator)
- The **Expo Go** app from the Play Store / App Store (for Option A)

## Option A — Expo Go (fastest)

Everything the app uses (camera, photo picker, secure store, file system) works
inside Expo Go, so there's nothing to build.

```bash
cd stow-a-way
npm install         # first time only (the web SessionStart hook does this for you)
npx expo start
```

Then on your phone:

1. Open **Expo Go**.
2. Scan the QR code in the terminal.
3. The app loads over Wi-Fi and hot-reloads as you edit.

Phone and computer not on the same network? Use a tunnel:

```bash
npx expo start --tunnel
```

Shortcuts once the dev server is running: press `a` for a connected Android
device/emulator, `i` for the iOS simulator, `r` to reload.

## Option B — Standalone Android APK (real install)

Builds an installable `.apk` in Expo's cloud — survives without the dev server
and can be shared with testers.

```bash
npm install -g eas-cli
eas login                                   # free Expo account
cd stow-a-way
eas build:configure                         # first time: sets extra.eas.projectId
eas build --platform android --profile preview
```

The `preview` profile (in `eas.json`) produces an APK. When the build finishes,
EAS shows a URL/QR — open it on the phone to download, then allow "install from
unknown sources" to install it.

For the Play Store artifact instead, use `--profile production` (produces an
`.aab`). See [`README.md`](./README.md) for the full build-and-submit flow.

## Checks before pushing

```bash
npm run typecheck                           # TypeScript, no emit
npx expo export --platform ios --output-dir /tmp/stow-export   # verify it bundles
```

## Notes

- Optional **AI photo analysis** needs your own Anthropic API key, pasted in
  **Settings** inside the app. Camera, items, search, photos, and export all
  work without it.
- First launch seeds a sample inventory; wipe it with **Settings → Delete
  everything**.
