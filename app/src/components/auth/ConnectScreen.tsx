"use client";

import { useState } from "react";
import { useConnect } from "wagmi";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, Mail, ArrowRight, ArrowLeft } from "lucide-react";
import { VLiteLogo } from "@/components/VLiteLogo";
import { VLiteWordmark } from "@/components/VLiteWordmark";
import { loginWithEmail } from "@/lib/circle";
import { useVLiteStore } from "@/store/useVLiteStore";

export function ConnectScreen() {
  const { connectors, connect, connectAsync, isPending, error: connectError } = useConnect();
  const setAuth = useVLiteStore((s) => s.setAuth);
  const [mode, setMode] = useState<"choose" | "email">("choose");
  const [email, setEmail] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  // The Circle connector is driven programmatically after a successful
  // email login (below) — it isn't a "pick your wallet" option, so it's
  // excluded from the manual wallet list rendered further down.
  const walletConnectors = connectors.filter((c) => c.id !== "circle-email");

  async function handleEmailSubmit() {
    if (!email.includes("@")) return;
    setEmailBusy(true);
    setEmailError(null);
    try {
      const session = await loginWithEmail(email);

      // loginWithEmail() just made this session available to the
      // circle-email wagmi connector — connect it now so useAccount() and
      // every on-chain hook in the app immediately see the Circle wallet.
      const circleWagmiConnector = connectors.find((c) => c.id === "circle-email");
      if (circleWagmiConnector) {
        await connectAsync({ connector: circleWagmiConnector });
      }

      setAuth("circle-email", session.walletAddress);
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
              Borderless P2P Finance — Built for Speed and Trust.
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
