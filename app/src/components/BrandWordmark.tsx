import { cn } from "@/lib/utils";

/**
 * The "vʟitePay" wordmark — the character after "v" is U+029F LATIN LETTER
 * SMALL CAPITAL L (ʟ), not a regular "L". Used only on the header and the
 * connect/login screen per this pass's scope.
 *
 * Deliberately separate from VLiteWordmark.tsx (plain "vLitePay"), which
 * stays untouched and keeps rendering everywhere else it's used
 * (tagline/body copy, buttons, KYC line, nav, and every other screen that
 * imports it) — those are explicitly unchanged this pass.
 */
export function BrandWordmark({ className, size = "text-lg" }: { className?: string; size?: string }) {
  return (
    <span className={cn("font-display font-extrabold tracking-tight inline-flex", size, className)}>
      <span
        className="bg-vlite-gradient bg-clip-text text-transparent"
        style={{ filter: "drop-shadow(0 0 12px rgba(124, 58, 237, 0.45))" }}
      >
        vʟite
      </span>
      <span
        className="text-ink-light dark:text-white"
        style={{ filter: "drop-shadow(0 0 10px rgba(255, 255, 255, 0.3))" }}
      >
        Pay
      </span>
    </span>
  );
}
