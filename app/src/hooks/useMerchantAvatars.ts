"use client";

import { useEffect, useState } from "react";

/**
 * Resolves avatars for a list of merchant wallet addresses via Supabase
 * (GET /api/profile/batch), NOT the local per-browser profile store — this
 * is what makes a merchant's uploaded avatar visible to every viewer
 * browsing P2P offers, not only the merchant viewing their own.
 *
 * Returns a map keyed by lowercased address -> avatar URL. An address with
 * no entry (not yet resolved, no profile, or no avatar set) means "show
 * the initials fallback" — callers should never treat a missing key as an
 * error state.
 *
 * Batched by design: pass every merchant address currently rendered (e.g.
 * OfferList passes the whole visible offer list's merchant addresses) so
 * one request resolves everyone, instead of one request per card.
 */
export function useMerchantAvatars(addresses: (string | undefined)[]): Record<string, string> {
  const [avatars, setAvatars] = useState<Record<string, string>>({});

  // Stable key so this only re-fetches when the actual SET of addresses
  // changes, not on every render where a new array happens to be passed.
  const unique = Array.from(new Set(addresses.filter((a): a is string => !!a).map((a) => a.toLowerCase()))).sort();
  const key = unique.join(",");

  useEffect(() => {
    if (unique.length === 0) {
      setAvatars({});
      return;
    }

    let cancelled = false;

    fetch(`/api/profile/batch?wallets=${encodeURIComponent(key)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled && json?.avatars) setAvatars(json.avatars);
      })
      .catch(() => {
        // Network/Supabase hiccup — leave avatars as-is (initials fallback
        // for anything unresolved); never surfaced as an error to the UI.
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return avatars;
}
