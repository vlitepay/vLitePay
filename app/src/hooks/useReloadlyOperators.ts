"use client";

import { useEffect, useState } from "react";
import { ReloadlyOperator } from "@/lib/types/reloadly";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

export function useReloadlyOperators(countryCode: string) {
  const [operators, setOperators] = useState<ReloadlyOperator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${BACKEND_URL}/airtime/operators?countryCode=${countryCode}`);
        if (!res.ok) throw new Error(`Backend returned ${res.status}`);
        const data = await res.json();
        // Reloadly returns either a bare array or { content: [...] } depending on
        // the endpoint/version — normalize both shapes here.
        const list: ReloadlyOperator[] = Array.isArray(data) ? data : data.content ?? [];
        if (!cancelled) setOperators(list);
      } catch (err: any) {
        if (!cancelled) {
          setError("Couldn't load network operators — is the backend running and RELOADLY_CLIENT_ID/SECRET set?");
          setOperators([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [countryCode]);

  return { operators, loading, error };
}
