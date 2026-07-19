# FetchBIN — Free tier + paid unlock

FetchBIN uses a **freemium** model:

- **Free:** 1 box (with unlimited items, photos, and AI sync on that box).
- **Paid — "FetchBIN Unlimited":** a **one-time, non-consumable** in-app purchase
  that lifts the box limit to unlimited.

A one-time unlock (rather than a subscription) fits an offline, local-first
utility: there's no server cost to cover, and buyers dislike subscriptions for
tools like this. If you'd rather do a subscription later, the same entitlement
plumbing works — you'd just sell an auto-renewing product instead.

## How the gate works in the code

The limit is enforced client-side; the entitlement is the source of truth.

| Piece | File |
|-------|------|
| Limit constant + `canAddBox()` + product id | `src/limits.ts` |
| Entitlement provider (`isPro`, `purchasePro`, `restore`) | `src/purchases.tsx` |
| Paywall screen | `src/screens/PaywallScreen.tsx` |
| Enforcement (Add Box → paywall when over the limit) | `src/screens/BoxesScreen.tsx` |
| Plan status + Upgrade/Restore | `src/screens/SettingsScreen.tsx` |

`FREE_BOX_LIMIT` in `src/limits.ts` is the single knob for the free allowance.

> **Important:** `src/purchases.tsx` currently ships a **local stub** so the
> free/paid flow is testable in Expo Go with no billing configured — "buying"
> just sets a flag in device storage. You **must** replace it with a real
> store-billing integration before release, or the upgrade won't charge (and
> "restore" won't work across devices).

## Store rules you have to follow

- **Digital unlocks must use the platform's own billing** — StoreKit on iOS and
  Google Play Billing on Android. You may **not** use Stripe/PayPal/web checkout
  for unlocking in-app features. (Apple now allows external-purchase *links* in
  some regions under strict rules, but in-app IAP is the safe default.)
- Apple takes 15–30%, Google 15–30% (15% under the small-business programs,
  which most indie devs qualify for).
- The paywall must clearly state what's purchased and the price, and offer
  **Restore Purchases** (App Store requires it). Both are already in the UI.

## Recommended: wire up RevenueCat

[RevenueCat](https://www.revenuecat.com) wraps StoreKit + Play Billing behind
one cross-platform API, does server-side receipt validation, and gives you an
`isPro`-style **entitlement** with cross-device restore for free at low volume.
It's the least-effort correct path.

### 1. Install (requires a dev build — not Expo Go)

```bash
cd fetchit
npx expo install react-native-purchases
# IAP needs native modules, so use a dev build:
eas build --profile development --platform ios      # or android
```

### 2. Configure products

- **App Store Connect** → your app → In-App Purchases → create a
  **Non-Consumable** with product id `net.timmoore.fetchbin.pro_unlimited`
  (see `PRO_PRODUCT_ID` in `src/limits.ts`).
- **Play Console** → Monetize → In-app products → create the same product id.
- **RevenueCat dashboard** → add both, attach them to an **Offering**, and map
  them to an **Entitlement** named `unlimited`.

### 3. Replace the stub

In `src/purchases.tsx`, swap the three marked stub functions:

```ts
import Purchases from 'react-native-purchases';

// once, on app start (put the platform key behind __DEV__ / env as needed):
await Purchases.configure({ apiKey: RC_PUBLIC_KEY });

async function loadEntitlement() {
  const info = await Purchases.getCustomerInfo();
  return !!info.entitlements.active['unlimited'];
}

async function purchase() {
  const offerings = await Purchases.getOfferings();
  const pkg = offerings.current?.availablePackages[0];
  const { customerInfo } = await Purchases.purchasePackage(pkg!);
  return !!customerInfo.entitlements.active['unlimited'];
}

async function restore() {
  const info = await Purchases.restorePurchases();
  return !!info.entitlements.active['unlimited'];
}
```

Also pull `priceLabel` from `pkg.product.priceString` so the paywall shows the
real localized price, and delete `resetPro` (it's a dev-only helper).

### 4. Test

- iOS: create a **Sandbox tester** in App Store Connect and sign in on the
  device; purchases are free in sandbox.
- Android: add testers to a **License testing** list and use an internal-testing
  track.

## Alternative without RevenueCat

`react-native-purchases` isn't required — `expo-in-app-purchases` is deprecated,
so if you skip RevenueCat, use [`react-native-iap`](https://github.com/hyochan/react-native-iap)
directly and validate receipts yourself. That's more code and you own the edge
cases (restores, refunds, family sharing), which is exactly what RevenueCat
handles for you.
