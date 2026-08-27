"use client";

import { useEffect, useState } from "react";
import { useConnect } from "wagmi";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, Mail, ArrowRight, ArrowLeft } from "lucide-react";
import { VLiteLogo } from "@/components/VLiteLogo";
import { VLiteWordmark } from "@/components/VLiteWordmark";
import { loginWithEmail, startGoogleLogin, completePendingGoogleLogin } from "@/lib/circle";
import { useVLiteStore } from "@/store/useVLiteStore";

/** lucide-react has no Google brand mark — small inline SVG, official 4-color "G". */
function GoogleIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.59-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

export function ConnectScreen() {
  const { connectors, connect, connectAsync, isPending, error: connectError } = useConnect();
  const setAuth = useVLiteStore((s) => s.setAuth);
  const [mode, setMode] = useState<"choose" | "email">("choose");
  const [email, setEmail] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);
  // True only during the brief window right after redirecting back from
  // Google, while completePendingGoogleLogin() is resolving — false and
  // near-instant on every other page load, since there's nothing pending.
  const [completingGoogle, setCompletingGoogle] = useState(false);

  // The Circle connector is driven programmatically after a successful
  // email login (below) — it isn't a "pick your wallet" option, so it's
  // excluded from the manual wallet list rendered further down.
  const walletConnectors = connectors.filter((c) => c.id !== "circle-email");

  /** Shared by both email and Google's success paths — connects the
   * session-based circle-email wagmi connector and flips the app's auth
   * state, identically regardless of which method produced the session. */
  async function finishCircleLogin(walletAddress: `0x${string}`, email?: string) {
    const circleWagmiConnector = connectors.find((c) => c.id === "circle-email");
    if (circleWagmiConnector) {
      await connectAsync({ connector: circleWagmiConnector });
    }
    setAuth("circle-email", walletAddress);

    // Best-effort, fire-and-forget: persist the email Circle just gave us
    // onto the profile (only if one isn't already stored — see
    // lib/supabase-profile-email.ts). Never awaited by the caller and never
    // surfaced as a login error — losing this write just means the profile
    // stays without an email, exactly like before this feature existed.
    // Absent entirely for Google logins where Google didn't return one,
    // which is expected and handled gracefully (fetch simply isn't called).
    if (email) {
      fetch("/api/profile/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: walletAddress, email }),
      }).catch(() => {
        // Deliberately silent — see comment above.
      });
    }
  }

  // Catches a Google login completing after the full-page redirect back
  // from accounts.google.com — see lib/circle.ts's completePendingGoogleLogin
  // for why this can't just be awaited inline in handleGoogleSubmit below.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await completePendingGoogleLogin().catch((err) => {
        if (!cancelled) setGoogleError(err?.message || "Google sign-in failed — please try again.");
        return null;
      });
      if (cancelled || !session) return;
      setCompletingGoogle(true);
      try {
        await finishCircleLogin(session.walletAddress, session.email);
      } catch (err: any) {
        if (!cancelled) setGoogleError(err?.message || "Something went wrong — please try again.");
      } finally {
        if (!cancelled) setCompletingGoogle(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleEmailSubmit() {
    if (!email.includes("@")) return;
    setEmailBusy(true);
    setEmailError(null);
    try {
      const session = await loginWithEmail(email);
      await finishCircleLogin(session.walletAddress, session.email);
    } catch (err: any) {
      setEmailError(
        err?.message === "Could not start Circle login session"
          ? "Email sign-in isn't configured on this environment yet — try connecting a wallet instead."
          : err?.message || "Something went wrong — please try again."
      );
    } finally {
      setEmailBusy(false);
    }
  }

  async function handleGoogleSubmit() {
    setGoogleBusy(true);
    setGoogleError(null);
    try {
      // Navigates the page to Google — nothing after this line runs in
      // this invocation. The result is caught by the useEffect above on
      // the next page load, after Google redirects back.
      await startGoogleLogin();
    } catch (err: any) {
      // Only reachable if startGoogleLogin() throws BEFORE the redirect
      // (e.g. Google isn't configured, or the device-token request failed)
      // — a real mid-flow failure is caught by the useEffect instead.
      setGoogleError(err?.message || "Something went wrong — please try again.");
      setGoogleBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="glass-panel w-full max-w-sm p-8 text-center relative overflow-hidden"
      >
        <div className="vlite-halo -top-20 left-1/2 -translate-x-1/2 h-52 w-52 rounded-full" aria-hidden />

        <div className="relative flex flex-col items-center gap-4">
          <VLiteLogo size={84} withHalo />

          <div>
            <h1 className="flex justify-center">
              <VLiteWordmark size="text-3xl" />
            </h1>
            <p className="text-sm text-ink-muted mt-1.5 max-w-[240px] mx-auto">
              Buy & sell stablecoins for local cash.
            </p>
          </div>

          <AnimatePresence mode="wait">
            {mode === "choose" ? (
              <motion.div
                key="choose"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15 }}
                className="w-full flex flex-col gap-2 mt-2"
              >
                <button
                  onClick={() => setMode("email")}
                  className="btn-vlite-primary w-full justify-between !py-3.5"
                >
                  <span className="flex items-center gap-2.5">
                    <Mail size={17} /> Continue with email
                  </span>
                  <ArrowRight size={16} />
                </button>

                <button
                  onClick={handleGoogleSubmit}
                  disabled={googleBusy || completingGoogle}
                  className="btn-vlite-secondary w-full justify-between !py-3.5 disabled:opacity-50"
                >
                  <span className="flex items-center gap-2.5">
                    <GoogleIcon />{" "}
                    {completingGoogle ? "Finishing sign-in…" : googleBusy ? "Redirecting to Google…" : "Continue with Google"}
                  </span>
                  <ArrowRight size={16} className="text-ink-muted" />
                </button>
                {googleError && <p className="text-xs text-danger -mt-1">{googleError}</p>}

                <div className="flex items-center gap-3 my-1">
                  <div className="h-px flex-1 bg-white/20 dark:bg-white/10" />
                  <span className="text-xs text-ink-muted">or connect a wallet</span>
                  <div className="h-px flex-1 bg-white/20 dark:bg-white/10" />
                </div>

                {walletConnectors.map((connector) => (
                  <button
                    key={connector.uid}
                    onClick={() => connect({ connector })}
                    disabled={isPending}
                    className="btn-vlite-secondary w-full justify-between !py-3.5 disabled:opacity-50"
                  >
                    <span className="flex items-center gap-2.5">
                      <Wallet size={17} className="text-vlite-purple" /> {connector.name}
                    </span>
                    <ArrowRight size={16} className="text-ink-muted" />
                  </button>
                ))}

                {connectError && <p className="text-xs text-danger mt-1">{connectError.message}</p>}
              </motion.div>
            ) : (
              <motion.div
                key="email"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                transition={{ duration: 0.15 }}
                className="w-full flex flex-col gap-3 mt-2"
              >
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleEmailSubmit()}
                  placeholder="you@example.com"
                  autoFocus
                  className="w-full rounded-xl px-4 py-3 bg-white/60 dark:bg-white/5 border border-white/30 dark:border-white/10 text-sm text-center outline-none focus:ring-2 focus:ring-vlite-cyan"
                />
                {emailError && <p className="text-xs text-danger">{emailError}</p>}
                <button onClick={handleEmailSubmit} disabled={emailBusy || !email.includes("@")} className="btn-vlite-primary w-full !py-3.5">
                  {emailBusy ? "Sending code…" : "Continue"}
                </button>
                <button
                  onClick={() => {
                    setMode("choose");
                    setEmailError(null);
                  }}
                  className="text-xs text-ink-muted hover:text-ink-light dark:hover:text-ink-dark flex items-center justify-center gap-1"
                >
                  <ArrowLeft size={12} /> Back
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <p className="text-[11px] text-ink-muted mt-2 max-w-[260px] mx-auto">
            vLitePay is a technology platform only. Users and merchants handle their own KYC/AML.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
