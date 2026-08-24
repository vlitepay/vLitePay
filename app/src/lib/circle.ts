"use client";

import { SocialLoginProvider } from "@circle-fin/w3s-pw-web-sdk/dist/src/types";
import { setCircleSession } from "./circleSession";
import { getCircleSdk, setActiveLoginCallback } from "./circleSdk";

export interface CircleAuthSession {
  userToken: string;
  encryptionKey: string;
  walletAddress: `0x${string}`;
  walletId: string;
  /** Known for email login (the address the user typed); present for Google
   * login only if Google actually returned it (oAuthInfo.socialUserInfo.email
   * — not guaranteed, e.g. if the OAuth scope didn't include email). Absent
   * otherwise — always handle this as possibly undefined, never required. */
  email?: string;
}

interface EmailLoginResult {
  userToken: string;
  encryptionKey: string;
}

/** Survives the full-page redirect to Google and back — see startGoogleLogin/completePendingGoogleLogin below. */
const GOOGLE_LOGIN_PENDING_KEY = "vlitepay-google-login-pending";

/**
 * Full Circle User-Controlled Wallets email OTP login, following Circle's
 * documented flow end to end:
 * https://developers.circle.com/wallets/user-controlled/build-a-wallet-app
 * ("Email OTP" tab).
 *
 *   1. sdk.getDeviceId() — identifies this browser to Circle.
 *   2. POST /api/circle/session — asks Circle to email an OTP; returns
 *      { deviceToken, deviceEncryptionKey, otpToken }.
 *   3. sdk.verifyOtp() — opens Circle's hosted OTP-entry UI; the SDK's
 *      login callback (registered once in circleSdk.ts) resolves with
 *      { userToken, encryptionKey } once the user enters the code.
 *   4. POST /api/circle/initialize with userToken — returns a challengeId
 *      to create the user's wallet (or Circle returns code 155106 if the
 *      user already has one, in which case we skip straight to step 6).
 *   5. sdk.execute(challengeId, ...) — user approves via Circle's hosted
 *      UI; Circle creates the wallet.
 *   6. GET /api/circle/wallets — reads back the wallet's address.
 */
export async function loginWithEmail(email: string): Promise<CircleAuthSession> {
  const sdk = getCircleSdk();
  const deviceId = await sdk.getDeviceId();

  const sessionRes = await fetch("/api/circle/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, deviceId }),
  });

  if (!sessionRes.ok) {
    const body = await sessionRes.json().catch(() => ({}));
    throw new Error(body?.error || "Could not start Circle login session");
  }

  const { deviceToken, deviceEncryptionKey, otpToken } = await sessionRes.json();

  sdk.updateConfigs({
    appSettings: { appId: process.env.NEXT_PUBLIC_CIRCLE_APP_ID || "" },
    // `email` here matches Circle's own documented sample for the email-OTP
    // flow (https://developers.circle.com/wallets/user-controlled/build-a-wallet-app),
    // but the installed SDK's LoginConfigs type doesn't model it — cast
    // rather than drop a field Circle's runtime actually expects.
    loginConfigs: { deviceToken, deviceEncryptionKey, otpToken, email: { email } } as any,
  });

  // Opens Circle's hosted OTP-entry modal; resolves once the user enters
  // the code and Circle validates it.
  const loginResult = await new Promise<EmailLoginResult>((resolve, reject) => {
    setActiveLoginCallback((error, result) => {
      setActiveLoginCallback(null);
      if (error || !result) {
        reject(new Error((error as any)?.message || "Email verification failed"));
        return;
      }
      resolve({ userToken: result.userToken, encryptionKey: result.encryptionKey });
    });
    sdk.verifyOtp();
  });

  const wallet = await initializeAndCreateWallet(loginResult);

  const session: CircleAuthSession = {
    userToken: loginResult.userToken,
    encryptionKey: loginResult.encryptionKey,
    walletAddress: wallet.address,
    walletId: wallet.id,
    email,
  };

  sdk.setAuthentication({ userToken: session.userToken, encryptionKey: session.encryptionKey });

  // Make this session available to the circle-email wagmi connector so the
  // caller can immediately follow up with connect({ connector }).
  setCircleSession({
    address: session.walletAddress,
    walletId: session.walletId,
    userToken: session.userToken,
    encryptionKey: session.encryptionKey,
  });

  return session;
}

/**
 * Circle User-Controlled Wallets Google social login — split into two
 * functions because, per Circle's own official reference implementation
 * (verified by fetching developers.circle.com/wallets/user-controlled/
 * build-a-wallet-app directly), performLogin() triggers a FULL TOP-LEVEL
 * PAGE REDIRECT to Google's OAuth consent screen, not a same-page popup.
 * That destroys this page's JS context, so a single async function that
 * awaits a Promise the way loginWithEmail does (below) cannot work here —
 * the promise would simply never resolve after the redirect-back, since
 * the code awaiting it no longer exists.
 *
 * Circle's official example handles this by persisting the device-token
 * pair (via cookies + the `cookies-next` package) and re-registering the
 * onLoginComplete callback on every page mount, so a fresh page load after
 * the redirect can still catch the result. This does the same thing using
 * localStorage (this app's existing convention, e.g. circleSession.ts —
 * no new dependency needed for what localStorage already covers for a
 * same-origin round trip).
 *
 * `startGoogleLogin()` — call this from the button's onClick. Persists the
 * device-token pair, configures the SDK, and calls performLogin(), which
 * navigates the page away. Nothing after that call runs in this same
 * invocation.
 *
 * `completePendingGoogleLogin()` — call this once on mount (e.g. a
 * ConnectScreen useEffect). Checks for a pending login left by
 * startGoogleLogin(); if found, reconstructs the SDK config and waits for
 * Circle's redirect-detection to fire the login-complete callback,
 * completing the exact same wallet-init/session-setup tail end as
 * loginWithEmail. Resolves `null` immediately (no-op) if there's nothing
 * pending, so it's safe to call unconditionally on every ConnectScreen
 * mount.
 */
export async function startGoogleLogin(): Promise<void> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error("Google sign-in isn't configured on this environment yet — try email instead.");
  }

  const sdk = getCircleSdk();
  const deviceId = await sdk.getDeviceId();

  const sessionRes = await fetch("/api/circle/social-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId }),
  });

  if (!sessionRes.ok) {
    const body = await sessionRes.json().catch(() => ({}));
    throw new Error(body?.error || "Could not start Google sign-in");
  }

  const { deviceToken, deviceEncryptionKey } = await sessionRes.json();

  localStorage.setItem(GOOGLE_LOGIN_PENDING_KEY, JSON.stringify({ deviceToken, deviceEncryptionKey }));

  const redirectUri = process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI || window.location.origin;

  sdk.updateConfigs({
    appSettings: { appId: process.env.NEXT_PUBLIC_CIRCLE_APP_ID || "" },
    loginConfigs: {
      deviceToken,
      deviceEncryptionKey,
      google: { clientId, redirectUri, selectAccountPrompt: true },
    },
  });

  // Navigates the page to Google. Anything after this line in this
  // specific call never runs — see completePendingGoogleLogin above.
  await sdk.performLogin(SocialLoginProvider.GOOGLE);
}

export async function completePendingGoogleLogin(): Promise<CircleAuthSession | null> {
  if (typeof window === "undefined") return null;

  const raw = localStorage.getItem(GOOGLE_LOGIN_PENDING_KEY);
  if (!raw) return null;

  const clearPending = () => localStorage.removeItem(GOOGLE_LOGIN_PENDING_KEY);

  let stored: { deviceToken: string; deviceEncryptionKey: string };
  try {
    stored = JSON.parse(raw);
  } catch {
    clearPending();
    return null;
  }

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) {
    clearPending();
    return null;
  }

  const sdk = getCircleSdk();
  const redirectUri = process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI || window.location.origin;

  // Reconstruct the same config the pre-redirect page had, and register
  // the completion callback directly via updateConfigs's second param
  // (rather than the activeLoginCallback trampoline used for email) —
  // Circle's SDK detects the OAuth response already present in the URL
  // and fires this on its own; performLogin() is NOT called again here.
  //
  // Bounded with a timeout: if nothing fires (e.g. the user closed the
  // Google tab without completing sign-in and came back to this page
  // later through some other route), this resolves null rather than
  // leaving an unresolved promise hanging forever.
  const loginResult = await new Promise<(EmailLoginResult & { email?: string }) | null>((resolve) => {
    let settled = false;
    const settle = (value: (EmailLoginResult & { email?: string }) | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const timeout = setTimeout(() => settle(null), 10_000);

    sdk.updateConfigs(
      {
        appSettings: { appId: process.env.NEXT_PUBLIC_CIRCLE_APP_ID || "" },
        loginConfigs: {
          deviceToken: stored.deviceToken,
          deviceEncryptionKey: stored.deviceEncryptionKey,
          google: { clientId, redirectUri, selectAccountPrompt: true },
        },
      },
      (error, result) => {
        clearTimeout(timeout);
        if (error || !result) {
          settle(null);
          return;
        }
        // oAuthInfo isn't on this file's narrowed local EmailLoginResult type
        // (that type only models the fields shared with email login) — cast
        // to read it, same "real field the installed types don't fully
        // model" pattern already used a few lines up for loginConfigs.
        const googleEmail = (result as any)?.oAuthInfo?.socialUserInfo?.email as string | undefined;
        settle({ userToken: result.userToken, encryptionKey: result.encryptionKey, email: googleEmail });
      }
    );
  });

  clearPending();
  if (!loginResult) return null;

  // Identical to loginWithEmail's tail end from here — wallet
  // initialization doesn't care how userToken/encryptionKey were obtained.
  const wallet = await initializeAndCreateWallet(loginResult);

  const session: CircleAuthSession = {
    userToken: loginResult.userToken,
    encryptionKey: loginResult.encryptionKey,
    walletAddress: wallet.address,
    walletId: wallet.id,
    email: loginResult.email,
  };

  sdk.setAuthentication({ userToken: session.userToken, encryptionKey: session.encryptionKey });

  setCircleSession({
    address: session.walletAddress,
    walletId: session.walletId,
    userToken: session.userToken,
    encryptionKey: session.encryptionKey,
  });

  return session;
}

/**
 * Initializes the Circle user (creating a wallet-creation challenge if
 * they don't already have one) and returns the resulting wallet's id + address.
 */
async function initializeAndCreateWallet(loginResult: EmailLoginResult): Promise<{ id: string; address: `0x${string}` }> {
  const sdk = getCircleSdk();

  const initRes = await fetch("/api/circle/initialize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userToken: loginResult.userToken }),
  });
  const initBody = await initRes.json().catch(() => ({}));

  if (initRes.ok) {
    // Fresh user — Circle returned a challenge to actually create the wallet.
    sdk.setAuthentication({ userToken: loginResult.userToken, encryptionKey: loginResult.encryptionKey });

    await new Promise<void>((resolve, reject) => {
      sdk.execute(initBody.challengeId, (error: any) => {
        if (error) {
          reject(new Error(error?.message || "Wallet creation was cancelled or failed"));
          return;
        }
        resolve();
      });
    });

    // Give Circle a moment to index the newly created wallet before listing it.
    await new Promise((r) => setTimeout(r, 2000));
  } else if (initBody?.code !== 155106) {
    // 155106 = "user already initialized" — not a failure, just means the
    // user already has a wallet; skip straight to listing it below.
    throw new Error(initBody?.message || initBody?.error || "Could not initialize Circle wallet");
  }

  const walletsRes = await fetch("/api/circle/wallets", {
    headers: { "x-user-token": loginResult.userToken },
  });

  if (!walletsRes.ok) {
    throw new Error("Could not load the wallet Circle just created");
  }

  const { wallets } = await walletsRes.json();
  const wallet = wallets?.[0];

  if (!wallet?.address || !wallet?.id) {
    throw new Error("No wallet found for this Circle account yet");
  }

  return { id: wallet.id as string, address: wallet.address as `0x${string}` };
}
