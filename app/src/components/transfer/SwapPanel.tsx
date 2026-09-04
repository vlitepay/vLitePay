"use client";

import { AppKitSwapPanel } from "@/components/transfer/AppKitSwapPanel";

/**
 * Circle App Kit Swap is the only Swap experience on the Transfer page —
 * StableFX's swap UI (contractTradeId / taker-funding) has been fully
 * removed from the UI. StableFX's backend routes and lib/stablefx.ts are
 * left in place unused (see git history / lib/stablefx.ts's own docs if
 * that path is ever revived), but nothing renders them anymore.
 */
export function SwapPanel() {
  return <AppKitSwapPanel />;
}
