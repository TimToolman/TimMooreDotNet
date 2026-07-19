# Branding & renaming guide

The app has already been renamed twice (**Stow-a-way → FetchIt → FetchBIN**), so
the name is centralized. This file is the map of every place the name appears and
how to change it again.

## Single source of truth

**[`brand.config.js`](./brand.config.js)** holds the name and all identifiers.
Everything else reads from it:

- `app.config.js` (native config) `require()`s it → app display name, slug,
  scheme, bundle ids, permission prompts.
- `src/brand.ts` re-exports typed constants (`APP_NAME`, `PRO_PRODUCT_NAME`,
  `PRO_PRODUCT_ID`, `STORAGE_PREFIX`, `SECURE_STORE_SLOT`, `SUPPORT_EMAIL`) used
  by every screen and storage module.

## To rename the app again (the easy 90%)

1. Edit **`DISPLAY_NAME`** in `brand.config.js`. That alone updates:
   - the shown app name (home title, native app name, splash),
   - the paywall / plan wording ("<Name> Unlimited"),
   - the iOS/Android camera & photo-library permission prompts,
   - every in-app screen that shows the name.
2. Update the human-written **prose** below (search-and-replace the old name).
   These are copy, not variables, so they're intentionally not wired to the
   constant:
   - `README.md`, `TESTING.md`, `MONETIZATION.md`
   - `store/listing.md`, `store/PRIVACY.md`
   - `server/README.md`, and the docstring in `scripts/make_icons.py`
3. (Optional) Regenerate icons if the mark should change: `npm run icons`.

That's it for a marketing rename.

## Do NOT change these on a rename (frozen after first store release)

These are identity, not branding. Changing them after the app ships breaks
things, so they live in `brand.config.js` but are deliberately **decoupled from
`DISPLAY_NAME`** — leave them as `fetchbin` even if the shown name changes:

| Value (`brand.config.js`) | Why it's frozen |
|---|---|
| `slug` / `scheme` | Deep-link scheme + EAS project identity |
| `iosBundleId` / `androidPackage` | App identity in both stores — a change is a *new app* |
| `proProductId` | In-app purchase id — a change orphans existing purchases |
| `storagePrefix` | AsyncStorage key prefix — a change wipes users' local data |
| `secureStoreSlot` | Keychain slot for the optional personal API key |

Two more frozen identifiers live outside `brand.config.js`:

- **Project folder `fetchit/`** — kept stable on purpose so a rename doesn't
  churn every path, the SessionStart hook, and CI. It's an internal directory,
  never shown to users.
- **`server/wrangler.toml` → `name = "fetchbin-ai-proxy"`** — the Cloudflare
  Worker service name determines its deployed URL. Frozen once deployed; the app
  points at that URL via `extra.aiProxyUrl` in `app.config.js`.
- **`package.json` → `"name"`** — internal npm package name, not user-visible.

## Where the name renders (for reference)

| Surface | Source |
|---|---|
| Native app name, splash, permission prompts | `app.config.js` ← `brand.config.js` |
| Home screen title | `App.tsx` → `APP_NAME` |
| Paywall badge, Settings plan/about/AI copy | `PaywallScreen.tsx` / `SettingsScreen.tsx` → `APP_NAME` / `PRO_PRODUCT_NAME` |
| Export filenames (`<prefix>-inventory.csv`) | `src/csv.ts` → `STORAGE_PREFIX` |
| Store listing, privacy policy, READMEs | prose (manual — see step 2) |
