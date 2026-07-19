# Stow-a-way

A private, local-first mobile app for cataloging what's in your boxes and bins.
Search every item, snap a photo of a box's contents, and let AI list what's
inside. Built with **Expo / React Native** so a single codebase ships to both
the **Apple App Store** and **Google Play**.

Stow-a-way is the standalone version of the "Garage Boxes" tab from
[timmoore.net](https://timmoore.net) — reworked to store everything on-device
instead of syncing through GitHub.

## Features

- **Boxes → items** — number, name, and note each box; add, edit, move, and
  remove items.
- **Full-text search** across box names and every item.
- **Photos per box** — take a photo or pick from the library, view full-screen,
  swipe between shots, reorder, caption, and delete.
- **AI photo sync** (optional) — when you add a new photo of a box, Claude
  re-reads it and **compares what it sees against the box's current item list**.
  A reconcile dialog then lets you tick which newly-seen items to **add** and
  which now-missing items to **remove**, edit the caption, and Save (or Cancel).
  Photos are never deleted automatically — that's up to you. Bring your own
  Anthropic API key; it's stored only in the device keychain.
- **Local-first** — data lives in on-device storage; photos are copied into the
  app's document directory. No account, no server.
- **Export** — share your inventory as CSV or a full JSON backup.
- **Light & dark** — follows the system appearance.

## Project layout

```
stow-a-way/
├── App.tsx                 Navigation shell (native stack)
├── app.json                Expo config: name, bundle IDs, icons, permissions
├── eas.json                EAS Build & Submit profiles for both stores
├── index.ts                Entry point
├── assets/                 Generated icons & splash (see scripts/make_icons.py)
├── scripts/make_icons.py   Regenerates all app icons from code (needs Pillow)
├── src/
│   ├── ai.ts               Anthropic photo-analysis call
│   ├── csv.ts              CSV / JSON export + share sheet
│   ├── seed.ts             First-launch sample inventory
│   ├── settings.ts         Secure API-key storage (expo-secure-store)
│   ├── store.tsx           Inventory state + persistence + photo files
│   ├── theme.ts            Apple-style light/dark palette
│   ├── types.ts            Shared types
│   └── screens/
│       ├── BoxesScreen.tsx       Home: search + box list
│       ├── BoxDetailScreen.tsx   Edit a box, its items and photos
│       ├── PhotoViewerScreen.tsx Full-screen gallery + AI analysis
│       └── SettingsScreen.tsx    API key, export, reset, about
└── store/                  App Store / Play listing copy & privacy policy
```

## Run it locally

Prerequisites: Node 18+, and the [Expo Go](https://expo.dev/go) app on your
phone (or an iOS Simulator / Android emulator).

```bash
cd stow-a-way
npm install
npm start          # scan the QR code with Expo Go
# or: npm run ios / npm run android
```

`npm run typecheck` runs the TypeScript compiler with no emit.

## Build for the stores (EAS)

Stow-a-way uses [EAS Build](https://docs.expo.dev/build/introduction/) to
produce store binaries in the cloud — no local Xcode/Android Studio required.

```bash
npm install -g eas-cli
eas login
eas build:configure          # links the project & fills extra.eas.projectId

# Production binaries
eas build --platform ios       --profile production   # -> .ipa for App Store
eas build --platform android   --profile production   # -> .aab for Play
# Or both at once:
eas build --platform all --profile production
```

Before the first production build:

1. **Bump identifiers if needed.** The app ships with
   `net.timmoore.stowaway` for both `ios.bundleIdentifier` and
   `android.package` in `app.json`. Change these to your own reverse-domain
   identifier if you're publishing under a different account.
2. **Apple**: enrol in the [Apple Developer Program](https://developer.apple.com/programs/)
   ($99/yr), create the app in App Store Connect, and note your Apple Team ID
   and the App Store Connect app ID.
3. **Google**: create a [Play Console](https://play.google.com/console) account
   ($25 one-time), create the app, and generate a service-account JSON key for
   automated submission (save it as `play-service-account.json` — it's
   git-ignored).

## Submit to the stores

Fill in the real values in `eas.json` under `submit.production` first (the
`REPLACE_WITH_…` placeholders), then:

```bash
eas submit --platform ios     --profile production --latest
eas submit --platform android --profile production --latest
```

- iOS lands in App Store Connect → TestFlight; submit for review from there.
- Android lands on the Play `internal` track; promote to production in the
  Play Console.

Listing copy, keywords, and the required privacy policy are in
[`store/`](./store). Version and build numbers are managed by
`autoIncrement` in the `production` profile (see `eas.json`).

## Regenerating icons

All icons/splash are generated from code so there are no opaque binary assets:

```bash
pip install pillow
npm run icons     # writes assets/icon.png, adaptive-icon.png, splash-icon.png, favicon.png
```
