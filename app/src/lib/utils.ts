import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { TokenSymbol } from "./constants";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Sensible display precision per token. Plain `Number.prototype.toLocaleString()`
 * defaults to a maximum of 3 fraction digits, which silently rounds small
 * cirBTC amounts (8 decimals on-chain) down to "0" and can also clip EURC
 * test-faucet amounts that carry more precision. Every place in the app that
 * displays a token amount (not a fiat amount) should go through
 * `formatTokenAmount` instead of calling `toLocaleString()` directly.
 */
export function tokenDisplayDecimals(symbol: TokenSymbol): number {
  return symbol === "cirBTC" ? 6 : 4;
}

export function formatTokenAmount(amount: number, symbol: TokenSymbol): string {
  if (!Number.isFinite(amount)) return "0";
  return amount.toLocaleString(undefined, { maximumFractionDigits: tokenDisplayDecimals(symbol) });
}
