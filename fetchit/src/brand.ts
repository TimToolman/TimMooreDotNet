import brand from '../brand.config';

/**
 * Typed re-exports of the branding values for use inside the app bundle.
 * Everything traces back to brand.config.js (the single source of truth) — see
 * that file and BRANDING.md before renaming.
 */

/** The shown app name. Safe to change on a rebrand. */
export const APP_NAME = brand.displayName;

/** Paid-tier display name, e.g. "FetchBIN Unlimited". */
export const PRO_PRODUCT_NAME = brand.proProductName;

/** Store product id for the unlimited upgrade. FROZEN after release. */
export const PRO_PRODUCT_ID = brand.proProductId;

/** AsyncStorage key prefix. FROZEN after release (changing it wipes local data). */
export const STORAGE_PREFIX = brand.storagePrefix;

/** SecureStore slot for the optional personal API key. FROZEN after release. */
export const SECURE_STORE_SLOT = brand.secureStoreSlot;

/** Support contact. */
export const SUPPORT_EMAIL = brand.supportEmail;
