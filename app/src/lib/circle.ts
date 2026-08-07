"use client";

import { setCircleSession } from "./circleSession";
import { getCircleSdk, setActiveLoginCallback } from "./circleSdk";

export interface CircleAuthSession {
  userToken: string;
  encryptionKey: string;
  walletAddress: `0x${string}`;
  walletId: string;
}

interface EmailLoginResult {
  userToken: string;
  encryptionKey: string;
}

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
