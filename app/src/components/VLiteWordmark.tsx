import { cn } from "@/lib/utils";

/**
 * The vLitePay text wordmark. Reserved for actual brand lockups (header,
 * connect screen, splash moments) — not for casual inline mentions of
 * "vLitePay" in body copy, which stay plain text for readability.
 */
export function VLiteWordmark({ className, size = "text-lg" }: { className?: string; size?: string }) {
  return (
    <span className={cn("font-display font-extrabold tracking-tight inline-flex", size, className)}>
      <span
        className="bg-vlite-gradient bg-clip-text text-transparent"
        style={{ filter: "drop-shadow(0 0 12px rgba(124, 58, 237, 0.45))" }}
      >
        vLite
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
