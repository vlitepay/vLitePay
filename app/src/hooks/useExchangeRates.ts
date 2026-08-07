"use client";

import { useEffect, useState } from "react";

export type RateSource = "coingecko" | "frankfurter" | "fallback";

export interface ExchangeRates {
  /** USD price per 1 unit of each crypto asset. */
  crypto: Record<"USDC" | "EURC" | "cirBTC", number>;
  /** Fiat units per 1 USD, e.g. rates.fiat.NGN = 1550 means 1 USD = 1550 NGN. */
  fiat: Record<string, number>;
  /** Backward-compat combined label (prioritizes crypto source) — kept for existing consumers. */
  source: RateSource;
  /** Where the crypto (USD) prices actually came from. */
  cryptoSource: RateSource;
  /** Where the fiat conversion rates actually came from. */
  fiatSource: RateSource;
  lastUpdated: number;
}

// Conservative static fallback so the UI never breaks if both providers are down.
// Covers every currency in the default request list below.
const FALLBACK: ExchangeRates = {
  crypto: { USDC: 1, EURC: 1.08, cirBTC: 65000 },
  fiat: {
    USD: 1,
    EUR: 0.92,
    GBP: 0.79,
    NGN: 1550,
    GHS: 15.6,
    KES: 129,
    ZAR: 18.2,
    PHP: 58.5,
    IDR: 16300,
    MYR: 4.47,
    VND: 25400,
    INR: 87.5,
    BRL: 5.7,
    MXN: 18.9,
  },
  source: "fallback",
  cryptoSource: "fallback",
  fiatSource: "fallback",
  lastUpdated: 0,
};

/** Broad default currency list for the P2P screen's Global Reference Rate card. */
export const DEFAULT_REFERENCE_CURRENCIES = Object.keys(FALLBACK.fiat).filter((c) => c !== "USD");

const CACHE_MS = 60_000;
let cache: ExchangeRates | null = null;
let cacheTime = 0;

async function fetchCoingecko(): Promise<Partial<ExchangeRates["crypto"]> | null> {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=usd-coin,euro-coin,bitcoin&vs_currencies=usd",
      { next: { revalidate: 60 } as any }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return {
      USDC: data["usd-coin"]?.usd ?? undefined,
      EURC: data["euro-coin"]?.usd ?? undefined,
      cirBTC: data["bitcoin"]?.usd ?? undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Frankfurter v2 (https://api.frankfurter.dev/v2) — 165 active currencies from
 * 84 central banks, including NGN, GHS, KES, PHP, IDR, MYR, BRL, etc. The
 * older v1 endpoint we used to call only mirrored the ECB's ~31 currencies
 * and did NOT cover most of VelaPay's actual trading-corridor currencies
 * (confirmed against frankfurter.dev/currencies — NGN, GHS, and KES are all
 * v2-only). v2 returns a flat array of { base, quote, rate } rows rather than
 * v1's nested { rates: {...} } object, so the parsing below is shaped for that.
 */
async function fetchFrankfurter(currencies: string[]): Promise<Record<string, number> | null> {
  try {
    const res = await fetch(`https://api.frankfurter.dev/v2/rates?base=USD&quotes=${currencies.join(",")}`);
    if (!res.ok) return null;
    const rows: { quote: string; rate: number }[] = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const rates = Object.fromEntries(rows.map((row) => [row.quote, row.rate]));
    return { USD: 1, ...rates };
  } catch {
    return null;
  }
}

export function useExchangeRates(fiatCurrencies: string[] = DEFAULT_REFERENCE_CURRENCIES) {
  const [rates, setRates] = useState<ExchangeRates>(cache ?? FALLBACK);
  const [loading, setLoading] = useState(!cache);

  useEffect(() => {
    let cancelled = false;

    async function load(force = false) {
      if (!force && cache && Date.now() - cacheTime < CACHE_MS) {
        setRates(cache);
        setLoading(false);
        return;
      }

      setLoading(true);
      const [crypto, fiat] = await Promise.all([fetchCoingecko(), fetchFrankfurter(fiatCurrencies)]);

      const cryptoSource: RateSource = crypto ? "coingecko" : "fallback";
      const fiatSource: RateSource = fiat ? "frankfurter" : "fallback";

      const merged: ExchangeRates = {
        crypto: {
          USDC: crypto?.USDC ?? FALLBACK.crypto.USDC,
          EURC: crypto?.EURC ?? FALLBACK.crypto.EURC,
          cirBTC: crypto?.cirBTC ?? FALLBACK.crypto.cirBTC,
        },
        fiat: { ...FALLBACK.fiat, ...(fiat ?? {}) },
        source: cryptoSource === "coingecko" ? "coingecko" : fiatSource,
        cryptoSource,
        fiatSource,
        lastUpdated: Date.now(),
      };

      cache = merged;
      cacheTime = Date.now();

      if (!cancelled) {
        setRates(merged);
        setLoading(false);
      }
    }

    load();
    const interval = setInterval(() => load(), CACHE_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [fiatCurrencies.join(",")]);

  const refetch = async () => {
    setLoading(true);
    const [crypto, fiat] = await Promise.all([fetchCoingecko(), fetchFrankfurter(fiatCurrencies)]);
    const cryptoSource: RateSource = crypto ? "coingecko" : "fallback";
    const fiatSource: RateSource = fiat ? "frankfurter" : "fallback";
    const merged: ExchangeRates = {
      crypto: {
        USDC: crypto?.USDC ?? FALLBACK.crypto.USDC,
        EURC: crypto?.EURC ?? FALLBACK.crypto.EURC,
        cirBTC: crypto?.cirBTC ?? FALLBACK.crypto.cirBTC,
      },
      fiat: { ...FALLBACK.fiat, ...(fiat ?? {}) },
      source: cryptoSource === "coingecko" ? "coingecko" : fiatSource,
      cryptoSource,
      fiatSource,
      lastUpdated: Date.now(),
    };
    cache = merged;
    cacheTime = Date.now();
    setRates(merged);
    setLoading(false);
  };

  return { rates, loading, refetch };
}
