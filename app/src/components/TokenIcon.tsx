import Image from "next/image";
import clsx from "clsx";
import { TOKENS, TokenSymbol } from "@/lib/constants";

/**
 * Renders the official token logo for a given symbol (see TOKENS[symbol].iconSrc,
 * /public/tokens/*.svg). The provided SVGs already include their own circular
 * colored background, so this just sizes and clips them — no extra badge
 * wrapper needed, unlike the old letter-glyph-in-a-colored-circle pattern
 * this replaces.
 *
 * Single shared component so USDC/EURC/cirBTC render identically across
 * Home, P2P, Send/Transfer, Deposit, and Top Up — change the icon once here
 * (or swap a file in /public/tokens) and every screen picks it up.
 */
export function TokenIcon({
  symbol,
  size = 32,
  className,
}: {
  symbol: TokenSymbol;
  size?: number;
  className?: string;
}) {
  const token = TOKENS[symbol];
  return (
    <Image
      src={token.iconSrc}
      alt={token.symbol}
      width={size}
      height={size}
      className={clsx("rounded-full shrink-0", className)}
      style={{ width: size, height: size }}
    />
  );
}
