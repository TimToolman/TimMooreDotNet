/**
 * Free tier: one box. Everything else about a box (unlimited items, photos, AI
 * analysis) stays free — the paid upgrade only lifts the box count to unlimited.
 */
export const FREE_BOX_LIMIT = 1;

/** Whether another box may be created given the current count and plan. */
export function canAddBox(currentCount: number, isPro: boolean): boolean {
  return isPro || currentCount < FREE_BOX_LIMIT;
}

/** Product identifier configured in App Store Connect / Play Console. */
export const PRO_PRODUCT_ID = 'net.timmoore.fetchit.pro_unlimited';
