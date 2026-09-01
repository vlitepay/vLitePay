import { createConnector } from "wagmi";
import { arcTestnet } from "./constants";
import { getCircleSdk } from "./circleSdk";
import { getCircleSession, setCircleSession } from "./circleSession";
import { refreshCircleSession, refreshCircleSessionIfStale } from "./circleTokenRefresh";
import { CircleSessionExpiredError, looksLikeStaleCircleSessionError } from "./circleErrors";

const CHAIN_ID_HEX = `0x${arcTestnet.id.toString(16)}`;

interface CircleProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on: (...args: unknown[]) => void;
  removeListener: (...args: unknown[]) => void;
}

/**
 * Normalizes ANY caught/rejected value into a proper Error with a real
 * string `.message`. This exists because we cannot assume Circle's SDK (a
 * third-party black box we don't control) always rejects/throws a
 * well-formed Error — it may call our execute() callback with something
 * unexpected, or throw a bare string/undefined internally. Without this,
 * whatever came out of Circle's SDK propagates straight through our
 * connector into wagmi/viem's own error-formatting code, which assumes a
 * normal Error shape and does not defensively guard against a provider
 * rejecting with something else — that mismatch is what previously surfaced
 * downstream as "Cannot read properties of undefined (reading 'message')"
 * instead of a real error message. Every rejection this connector can
 * produce is now routed through this first.
 */
function toError(value: unknown, fallbackMessage: string): Error {
  if (value instanceof Error) return value;
  if (typeof value === "string" && value.trim()) return new Error(value);
  if (value && typeof value === "object") {
    const message = (value as Record<string, unknown>).message ?? (value as Record<string, unknown>).error;
    if (typeof message === "string" && message.trim()) return new Error(message);
  }
  return new Error(fallbackMessage);
}

/**
 * Wires the Circle Programmable Wallet session into wagmi as a real
 * connector, so `useAccount()` — and every hook built on top of it
 * (useTokenBalances, useTrade, escrow reads/writes, etc.) — works
 * identically for a Circle email login as it does for injected/WalletConnect
 * wallets.
 *
 * The connector doesn't hold its own credentials. It reads whatever session
 * `loginWithEmail()` most recently wrote to `circleSession.ts` at connect()
 * time, since the connector instance itself is created once, at app startup,
 * before any user has logged in.
 *
 * Reads (getAccounts/getChainId) are answered directly. Writes
 * (eth_sendTransaction, signing) are routed through Circle's challenge flow:
 * our backend creates the transaction/signature request server-side with
 * Circle's API and returns a challengeId, then the Circle Web SDK's
 * `execute()` opens its PIN/biometric modal to actually authorize it.
 */
export function circleConnector() {
  return createConnector((config) => ({
    id: "circle-email",
    name: "Circle Email Wallet",
    type: "circle-email" as const,

    async connect(parameters?: { chainId?: number; isReconnecting?: boolean; withCapabilities?: boolean }) {
      const session = getCircleSession();
      if (!session) {
        throw new Error("No active Circle session — call loginWithEmail() before connecting.");
      }
      // wagmi's Connector.connect() return type is conditional on the
      // `withCapabilities` generic (EIP-5792 call-bundling support), which
      // this connector doesn't implement — cast rather than fight a
      // conditional type that doesn't apply to us.
      return { accounts: [session.address], chainId: arcTestnet.id } as any;
    },

    async disconnect() {
      setCircleSession(null);
    },

    async getAccounts() {
      const session = getCircleSession();
      return session ? ([session.address] as const) : [];
    },

    async getChainId() {
      return arcTestnet.id;
    },

    async isAuthorized() {
      return !!getCircleSession();
    },

    async switchChain({ chainId }) {
      const chain = config.chains.find((c) => c.id === chainId) ?? config.chains[0];
      return chain;
    },

    async getProvider(): Promise<CircleProvider> {
      return {
        async request({ method, params }) {
          try {
            switch (method) {
              case "eth_chainId":
                return CHAIN_ID_HEX;

              case "eth_accounts":
              case "eth_requestAccounts": {
                const session = getCircleSession();
                return session ? [session.address] : [];
              }

              case "eth_sendTransaction":
              case "personal_sign":
              case "eth_signTypedData_v4": {
                const session = getCircleSession();
                if (!session) throw new Error("Circle wallet not connected");
                return await executeCircleChallenge(method, params, session);
              }

              default:
                throw new Error(`Circle wallet: unsupported RPC method "${method}"`);
            }
          } catch (err) {
            // Belt-and-braces: whatever went wrong above (including
            // anything unexpected bubbling out of Circle's own SDK), make
            // sure wagmi/viem only ever see a real Error with a real
            // message — never rethrow a raw/malformed value.
            throw toError(err, "Circle wallet request failed");
          }
        },
        on() {
          // No live provider events to subscribe to yet — Circle's SDK
          // doesn't expose an EIP-1193 event emitter. Accounts/chain are
          // effectively static for the lifetime of a session.
        },
        removeListener() {},
      };
    },

    onAccountsChanged() {},
    onChainChanged() {},
    onDisconnect() {
      setCircleSession(null);
    },
  }));
}

/**
 * Asks our backend to create the actual Circle transaction/signature
 * request (this is the server-side call into Circle's Wallets API using
 * CIRCLE_API_KEY — see app/api/circle/challenge/route.ts), then hands the
 * resulting challengeId to the Circle SDK, which opens its PIN/biometric
 * modal and reports back the executed result.
 *
 * Session freshness: refreshes the Circle session first if it looks stale
 * (missing issuedAt/refreshToken counts as stale — see
 * lib/circleTokenRefresh.ts). If EITHER the challenge-creation request or
 * Circle's SDK execute() step then fails with something that looks like a
 * stale/expired session (Circle's error 155104, "unauthorized", or the
 * generic-looking RPC failure that a stale session sometimes shows up as —
 * see lib/circleErrors.ts), this refreshes once more and retries the
 * WHOLE flow (fresh challenge + fresh execute) exactly once. If that retry
 * also fails for a session-related reason, or the refresh itself fails,
 * this throws CircleSessionExpiredError rather than hanging, looping, or
 * asking the user to log out first — Send/top-up/P2P's own catch blocks
 * (via lib/circleErrors.ts's describeCircleWriteError) turn that into
 * "Session expired. Sign in again." A genuine unrelated failure (the user
 * cancelling the PIN prompt, a real contract revert, an actual network
 * hiccup) is never retried and passes through as-is.
 */
async function executeCircleChallenge(
  method: string,
  params: unknown[] | undefined,
  initialSession: { userToken: string; walletId: string },
  hasRetried = false
): Promise<string> {
  await refreshCircleSessionIfStale();

  const session = getCircleSession() ?? initialSession;
  if (!getCircleSession()) {
    throw new CircleSessionExpiredError();
  }

  async function retryOnceOrGiveUp(cause: unknown): Promise<string> {
    if (hasRetried) {
      setCircleSession(null);
      throw new CircleSessionExpiredError();
    }
    const refreshed = await refreshCircleSession();
    const freshSession = getCircleSession();
    if (!refreshed || !freshSession) {
      throw new CircleSessionExpiredError();
    }
    return executeCircleChallenge(method, params, freshSession, true);
  }

  const res = await fetch("/api/circle/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, params, userToken: session.userToken, walletId: session.walletId }),
  }).catch((err) => {
    throw toError(err, "Could not reach the server to start Circle signing");
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const challengeError = new Error(body?.error || "Could not create Circle signing challenge");
    if (body?.code === 155104 || looksLikeStaleCircleSessionError(challengeError)) {
      return retryOnceOrGiveUp(challengeError);
    }
    throw challengeError;
  }

  const { challengeId } = await res.json();
  if (!challengeId) {
    throw new Error("Server did not return a Circle challengeId");
  }

  const sdk = getCircleSdk();
  const submittedAt = Date.now();

  // Circle's execute() reports back through a callback rather than a
  // resolved/rejected promise directly — wrap it in one, but treat
  // *anything* unexpected the callback hands us (a non-Error `error`, or a
  // callback invoked with neither an error nor a usable result) as a
  // failure rather than silently resolving with something we can't use.
  let executeResult: any;
  try {
    executeResult = await new Promise((resolve, reject) => {
      try {
        sdk.execute(challengeId, (error: unknown, result: unknown) => {
          if (error) {
            reject(toError(error, "Circle signing was cancelled or failed"));
            return;
          }
          resolve(result);
        });
      } catch (err) {
        // Guards against sdk.execute() throwing synchronously instead of
        // going through the callback at all.
        reject(toError(err, "Circle signing was cancelled or failed"));
      }
    });
  } catch (err) {
    if (looksLikeStaleCircleSessionError(err)) {
      return retryOnceOrGiveUp(err);
    }
    throw err;
  }

  // Signing challenges (personal_sign/eth_signTypedData_v4) return the
  // signature directly in the execute() callback. Circle's documented
  // result shape nests type-specific payloads under `.data`, but we also
  // defensively check a couple of alternate shapes in case that ever
  // differs, rather than assuming one exact path and crashing if it's off.
  if (method !== "eth_sendTransaction") {
    const signature = executeResult?.data?.signature ?? executeResult?.signature;
    if (!signature) {
      throw new Error("Circle did not return a signature for this request");
    }
    return signature;
  }

  // Transaction challenges DON'T return an on-chain txHash here — only
  // Circle's own internal transaction id, confirming the challenge itself
  // was approved. The real txHash only exists once Circle has broadcast the
  // transaction on-chain, so we poll for it (see pollForTxHash) rather than
  // returning undefined — which is exactly what previously caused "waiting
  // for transaction with hash 'undefined'" downstream.
  //
  // Circle's execute() callback result reliably includes `.data.signature`
  // for signing challenges (confirmed in their own SDK samples), but does
  // NOT reliably expose the created transaction's id for a transaction-type
  // challenge across SDK versions — checking a few known field shapes here
  // is a fast path when it works, but when it doesn't ("Circle did not
  // return a transaction id" was surfacing even though the transaction had
  // already confirmed on-chain), we fall back to asking Circle directly
  // for this wallet's most recent transaction instead of guessing further
  // field names.
  const directTransactionId =
    executeResult?.data?.id ?? executeResult?.id ?? executeResult?.data?.transactionId ?? executeResult?.transactionId;

  const transactionId = directTransactionId ?? (await resolveLatestTransactionId(session.userToken, session.walletId, submittedAt));

  if (!transactionId) {
    throw new Error("Could not determine which Circle transaction to track after signing");
  }

  return pollForTxHash(transactionId, session.userToken);
}

/**
 * Fallback for when Circle's execute() callback doesn't hand back a usable
 * transaction id directly (see caller). Lists this wallet's most recent
 * transactions (app/api/circle/transactions/route.ts, same X-User-Token
 * scoping as the wallet lookup during login) and picks the most recent one
 * created at or after `submittedAt` — a short retry loop, since the
 * transaction record may take a moment to appear in the list after the
 * challenge executes.
 */
async function resolveLatestTransactionId(userToken: string, walletId: string, submittedAt: number): Promise<string | null> {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    const res = await fetch("/api/circle/transactions", {
      headers: { "x-user-token": userToken },
    }).catch(() => null);

    if (res?.ok) {
      const body = await res.json().catch(() => null);
      const transactions: any[] = body?.transactions ?? [];
      const match = transactions.find((t) => {
        const created = t.createDate ? new Date(t.createDate).getTime() : 0;
        const sameWallet = !t.walletId || t.walletId === walletId; // tolerate the field being absent
        return sameWallet && created >= submittedAt - 5_000; // small grace window for clock skew
      });
      if (match?.id) return match.id;
    }

    await new Promise((r) => setTimeout(r, 2_000));
  }

  return null;
}

const TX_POLL_INTERVAL_MS = 2000;
const TX_POLL_TIMEOUT_MS = 60_000;

// Circle's documented terminal transaction states — see
// https://developers.circle.com/w3s/asynchronous-states-and-statuses
const TX_SUCCESS_STATES = new Set(["COMPLETE", "CONFIRMED"]);
const TX_FAILURE_STATES = new Set(["FAILED", "CANCELLED", "DENIED"]);

/**
 * Polls our backend's transaction-status proxy (app/api/circle/transactions/[id])
 * until the transaction reaches a terminal state, then returns its real
 * on-chain txHash. Requires BOTH a recognized success state AND a present
 * txHash before returning — a txHash could in principle appear before the
 * state has actually settled, and returning early on that alone is exactly
 * the kind of "close enough" assumption that produced silent failures
 * before.
 */
async function pollForTxHash(transactionId: string, userToken: string): Promise<string> {
  const deadline = Date.now() + TX_POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const res = await fetch(`/api/circle/transactions/${transactionId}`, {
      headers: { "x-user-token": userToken },
    }).catch(() => null);

    if (res?.ok) {
      const body = await res.json().catch(() => null);
      const state: string | undefined = body?.state;
      const txHash: string | undefined = body?.txHash;
      const errorReason: string | undefined = body?.errorReason;

      if (state && TX_FAILURE_STATES.has(state)) {
        throw new Error(errorReason || `Circle transaction ${state.toLowerCase()}`);
      }
      if (state && TX_SUCCESS_STATES.has(state) && txHash) {
        return txHash;
      }
    }

    await new Promise((r) => setTimeout(r, TX_POLL_INTERVAL_MS));
  }

  throw new Error("Timed out waiting for Circle to confirm the transaction on-chain");
}
