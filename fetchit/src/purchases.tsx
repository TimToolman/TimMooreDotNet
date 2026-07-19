import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { STORAGE_PREFIX } from './brand';

/**
 * Entitlement layer for the "Unlimited boxes" upgrade.
 *
 * This ships with a LOCAL STUB so the free/paid gate is fully testable in Expo
 * Go with no native billing configured: the "pro" flag is just persisted to
 * device storage. Before release, swap the two marked functions for a real
 * store-billing SDK — RevenueCat (`react-native-purchases`) is recommended
 * because it handles StoreKit + Play Billing, receipt validation, and
 * cross-device restore behind one `isPro` entitlement. See MONETIZATION.md.
 */

const PRO_KEY = `${STORAGE_PREFIX}:pro:v1`;

interface PurchasesValue {
  isPro: boolean;
  ready: boolean;
  /** Displayed on the paywall; a real SDK returns the localized store price. */
  priceLabel: string;
  purchasePro: () => Promise<boolean>;
  restore: () => Promise<boolean>;
  /** Dev-only helper so you can re-test the locked state. */
  resetPro: () => Promise<void>;
}

const PurchasesContext = createContext<PurchasesValue | null>(null);

// ── Swap this block for RevenueCat ──────────────────────────────────────────
// import Purchases from 'react-native-purchases';
// await Purchases.configure({ apiKey });
// const info = await Purchases.getCustomerInfo();
// isPro = !!info.entitlements.active['unlimited'];
// purchase: const { customerInfo } = await Purchases.purchaseStoreProduct(product);
// restore:  const info = await Purchases.restorePurchases();
// ────────────────────────────────────────────────────────────────────────────

async function loadEntitlement(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(PRO_KEY)) === '1';
  } catch {
    return false;
  }
}

async function grantEntitlementStub(): Promise<boolean> {
  // STUB: pretend the store returned a successful purchase.
  await AsyncStorage.setItem(PRO_KEY, '1');
  return true;
}

export function PurchasesProvider({ children }: { children: React.ReactNode }) {
  const [isPro, setIsPro] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadEntitlement().then((v) => {
      setIsPro(v);
      setReady(true);
    });
  }, []);

  const purchasePro = useCallback(async () => {
    const ok = await grantEntitlementStub();
    if (ok) setIsPro(true);
    return ok;
  }, []);

  const restore = useCallback(async () => {
    const ok = await loadEntitlement();
    setIsPro(ok);
    return ok;
  }, []);

  const resetPro = useCallback(async () => {
    await AsyncStorage.removeItem(PRO_KEY);
    setIsPro(false);
  }, []);

  const value = useMemo<PurchasesValue>(
    () => ({
      isPro,
      ready,
      priceLabel: '$4.99 one-time',
      purchasePro,
      restore,
      resetPro,
    }),
    [isPro, ready, purchasePro, restore, resetPro],
  );

  return <PurchasesContext.Provider value={value}>{children}</PurchasesContext.Provider>;
}

export function usePurchases(): PurchasesValue {
  const ctx = useContext(PurchasesContext);
  if (!ctx) throw new Error('usePurchases must be used within a PurchasesProvider');
  return ctx;
}
