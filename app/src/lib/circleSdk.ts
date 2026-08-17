"use client";

import { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";

/**
 * Themes Circle's hosted OTP/challenge UI (email OTP, PIN entry, tx
 * confirmation) to match vLitePay's dark UI, using `sdk.setThemeColor()`.
 *
 * Field names below are verified against the installed
 * @circle-fin/w3s-pw-web-sdk's ThemeColor interface
 * (dist/src/types.d.ts) and Circle's own example usage
 * (examples/js-example/src/index.js) — not guessed. No `ThemeColor` type
 * is imported from the package (uncertain whether it's re-exported from
 * the package root) — this plain object literal is instead checked
 * structurally by TypeScript against `setThemeColor`'s real parameter
 * type, which gives the same compile-time safety without depending on an
 * import path we haven't confirmed exists.
 *
 * Colors are vLitePay's actual tokens (see tailwind.config.ts):
 *   surface.dark-raised #131728, vlite.indigo #6366F1, vlite.cyan #22D3EE,
 *   ink.dark #F4F5FA, ink.muted #8A8FA3, success #22C55E, danger #F43F5E.
 */
function applyCircleTheme(sdk: W3SSdk) {
  try {
    sdk.setThemeColor({
      // Modal backdrop — matches the app's own modal convention (e.g.
      // DisputeModal's bg-black/50).
      backdrop: "#000000",
      backdropOpacity: 0.5,

      // Modal surface + borders — matches surface.dark-raised and the
      // app's subtle white/10-ish dividers on dark panels.
      bg: "#131728",
      divider: "#262B40",

      // Semantic colors — exact tailwind tokens.
      success: "#22C55E",
      error: "#F43F5E",

      // Text — all light-on-dark for readability, ink.dark for primary
      // content, ink.muted for de-emphasized text, cyan for highlighted
      // values (matches the brand gradient's accent stop).
      textMain: "#F4F5FA",
      textMain2: "#E2E4F0",
      textAuxiliary: "#8A8FA3",
      textAuxiliary2: "#6B7086",
      textSummary: "#F4F5FA",
      textSummaryHighlight: "#22D3EE",
      textPlaceholder: "#6B7086",
      textDetailToggle: "#8A8FA3",

      // Buttons/interactive elements — vlite-indigo fill with white text,
      // matching .btn-vlite-primary across the rest of the app.
      textInteractive: "#FFFFFF",
      interactiveBg: "#6366F1",

      tooltipText: "#F4F5FA",
      tooltipBg: "#131728",

      // PIN entry dots — empty dots subtle on the dark surface, filled
      // dots use the same indigo accent as buttons.
      pinDotBase: "#1C2033",
      pinDotBaseBorder: "#3A3F58",
      pinDotActivated: "#6366F1",
    });
  } catch {
    // Theming is purely cosmetic — never let it affect the auth/signing flow.
  }
}

/**
 * Rebrands Circle's hosted UI copy (titles/subtitles/labels) to read as
 * vLitePay rather than generic Circle wording, using `sdk.setLocalizations()`.
 *
 * Field names verified against the installed
 * @circle-fin/w3s-pw-web-sdk's Localizations interface
 * (dist/src/types.d.ts) — not guessed, same verification approach as
 * applyCircleTheme above.
 *
 * DELIBERATELY ONLY sets label/title/subtitle fields (static copy) — never
 * `from`, `to`, `mainCurrency`, or `exchangeValue` on TransactionRequest/
 * ContractInteraction. Those hold the actual per-transaction data the SDK
 * fills in dynamically (amount, addresses); overriding them with static
 * strings here would risk showing incorrect transaction details in a
 * security-sensitive confirmation dialog — a correctness/security concern,
 * not just cosmetics. Only the labels describing those fields are touched.
 *
 * Applied once at singleton construction (same as theme) — every OTP/PIN/
 * tx-confirmation popup for the lifetime of this SDK instance uses this
 * copy, rather than being set per-action. Wiring different copy per
 * on-chain action (escrow lock vs. dispute vs. approve, etc.) would need
 * call sites across useEscrowActions.ts/useMerchantActions.ts/etc. to each
 * call setLocalizations right before their own execute() — a materially
 * bigger, riskier change than this task's scope, so deliberately not done.
 */
function applyCircleLocalizations(sdk: W3SSdk) {
  try {
    sdk.setLocalizations({
      common: {
        confirm: "Confirm",
        sign: "Sign",
        continue: "Continue",
        retry: "Try again",
      },
      emailOtp: {
        title: "Verify your vLitePay wallet",
        subtitle: "Enter the 6-digit code we sent to your email to continue.",
        resendHint: "Didn't receive the code?",
        resend: "Send again",
      },
      transactionRequest: {
        title: "Confirm transaction",
        subtitle: "Review the details below, then confirm to complete this action in vLitePay.",
        fromLabel: "From",
        toLabel: "To",
        networkFeeLabel: "Network fee",
      },
      contractInteraction: {
        title: "Confirm contract interaction",
        subtitle: "Review the details below, then confirm to complete this action in vLitePay.",
        fromLabel: "From",
        contractAddressLabel: "Contract address",
        networkFeeLabel: "Network fee",
      },
      signatureRequest: {
        title: "Confirm signature",
        subtitle: "vLitePay is requesting your signature to verify wallet ownership.",
        descriptionLabel: "Message",
      },
    });
  } catch {
    // Copy is purely cosmetic — never let it affect the auth/signing flow.
  }
}

/**
 * Singleton Circle Web SDK instance. Split out into its own module (rather
 * than living in circle.ts) so both circle.ts and circleSession.ts can
 * import it without creating a circular dependency between the two.
 *
 * Email OTP (and social) login requires the SDK to be constructed with a
 * login-result callback as its second argument — Circle's hosted OTP UI
 * reports back through that callback, not through verifyOtp()'s return
 * value. Since the SDK instance is a lazily-created singleton (constructed
 * once, well before any particular login attempt exists), the callback
 * passed at construction time is a stable trampoline that forwards to
 * whichever callback is currently registered via setActiveLoginCallback() —
 * set right before each verifyOtp() call and cleared right after.
 */
let sdkInstance: W3SSdk | null = null;
type LoginCallback = (error: unknown, result: any) => void;
let activeLoginCallback: LoginCallback | null = null;

export function getCircleSdk(): W3SSdk {
  if (!sdkInstance) {
    sdkInstance = new W3SSdk(
      { appSettings: { appId: process.env.NEXT_PUBLIC_CIRCLE_APP_ID || "" } },
      (error, result) => {
        activeLoginCallback?.(error, result);
      }
    );
    applyCircleTheme(sdkInstance);
    applyCircleLocalizations(sdkInstance);
  }
  return sdkInstance;
}

/** Registers the callback that receives the result of the next verifyOtp()/performLogin() call. */
export function setActiveLoginCallback(cb: LoginCallback | null) {
  activeLoginCallback = cb;
}

