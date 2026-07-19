/**
 * SINGLE SOURCE OF TRUTH for app naming.
 *
 * The app has been rebranded before (Stow-a-way → FetchIt → FetchBIN), so the
 * name is centralized here. To rename again:
 *
 *   1. Change DISPLAY_NAME below — this updates the app's shown name, the
 *      paywall/product wording, permission prompts, and every UI screen (they
 *      all read `APP_NAME` from src/brand.ts, which re-exports this file).
 *   2. Update the prose/docs listed in BRANDING.md (README, store listing,
 *      privacy policy, etc.) — those are human-written copy, not variables.
 *
 * The IDENTIFIERS block is DIFFERENT: those are frozen once the app ships to a
 * store. Changing a bundle id, slug, product id, storage prefix, or the
 * project folder after release breaks app identity, in-app purchases, or wipes
 * users' local data. Do NOT tie them to DISPLAY_NAME — leave them as-is across
 * future rebrands. They intentionally still read "fetchbin" even if the shown
 * name changes.
 */

// ---- Freely changeable (marketing name) --------------------------------------
const DISPLAY_NAME = 'FetchBIN';

// ---- Frozen after first store release ---------------------------------------
const SLUG = 'fetchbin'; // Expo slug + deep-link scheme
const BUNDLE_ID = 'net.timmoore.fetchbin'; // iOS bundleIdentifier + Android package
const STORAGE_PREFIX = 'fetchbin'; // AsyncStorage key prefix — changing it wipes local data

module.exports = {
  // Display / marketing (safe to change on a rebrand)
  displayName: DISPLAY_NAME,
  proProductName: `${DISPLAY_NAME} Unlimited`,

  // Frozen identifiers (do not change after release)
  slug: SLUG,
  scheme: SLUG,
  iosBundleId: BUNDLE_ID,
  androidPackage: BUNDLE_ID,
  proProductId: `${BUNDLE_ID}.pro_unlimited`,
  storagePrefix: STORAGE_PREFIX,
  secureStoreSlot: `${STORAGE_PREFIX}_anthropic_key`,

  // Contact
  supportEmail: 'tgmoore@gmail.com',
};
