"use client";

import { useEffect, useRef, useState } from "react";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

const POLL_INTERVAL_MS = 4000;
const POLL_MAX_ATTEMPTS = 30; // ~2 minutes

export type ReloadlyPollStatus = "pending" | "SUCCESSFUL" | "FAILED" | "REFUNDED" | "unknown";

function normalizeStatus(raw: unknown): ReloadlyPollStatus {
  const s = String(raw ?? "").toUpperCase();
  if (s === "SUCCESSFUL" || s === "FAILED" || s === "REFUNDED") return s;
  if (s === "PROCESSING" || s === "PENDING" || s === "") return "pending";
  return "unknown";
}

/**
 * Polls GET /airtime/topup/:transactionId/status (see
 * backend/src/routes/reloadly.ts, which proxies Reloadly's own "Get Topup
 * Status" endpoint) until the transaction reaches SUCCESSFUL, FAILED, or
 * REFUNDED — or polling times out, in which case the caller is left with
 * whatever the last known status was rather than a fabricated result.
 *
 * `initialStatus` seeds this from the original POST /topups response, so a
 * top-up that Reloadly already resolved synchronously doesn't need to poll
 * at all.
 */
export function useReloadlyStatusPoll(transactionId: string | null, initialStatus: string | null) {
  const [status, setStatus] = useState<ReloadlyPollStatus>(normalizeStatus(initialStatus));
  const [polling, setPolling] = useState(false);
  const [operatorTransactionId, setOperatorTransactionId] = useState<string | null>(null);
  const attemptsRef = useRef(0);

  useEffect(() => {
    if (!transactionId) return;
    const seeded = normalizeStatus(initialStatus);
    if (seeded !== "pending") {
      setStatus(seeded);
      return;
    }

    let cancelled = false;
    setPolling(true);

    async function tick() {
      if (cancelled) return;
      attemptsRef.current += 1;

      try {
        const res = await fetch(`${BACKEND_URL}/airtime/topup/${transactionId}/status`);
        const data = await res.json().catch(() => null);
        if (res.ok && data) {
          const transaction = data.transaction ?? data;
          const next = normalizeStatus(transaction?.status ?? data?.status);
          if (transaction?.operatorTransactionId) setOperatorTransactionId(String(transaction.operatorTransactionId));
          if (next !== "pending" && next !== "unknown") {
            if (!cancelled) {
              setStatus(next);
              setPolling(false);
            }
            return;
          }
        }
      } catch {
        // Transient network error — keep polling, same as any other missed tick.
      }

      if (!cancelled && attemptsRef.current < POLL_MAX_ATTEMPTS) {
        setTimeout(tick, POLL_INTERVAL_MS);
      } else if (!cancelled) {
        setPolling(false);
      }
    }

    tick();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactionId]);

  return { status, polling, operatorTransactionId };
}
