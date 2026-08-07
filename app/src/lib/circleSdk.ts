"use client";

import { W3SSdk } from "@circle-fin/w3s-pw-web-sdk";

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
  }
  return sdkInstance;
}

/** Registers the callback that receives the result of the next verifyOtp()/performLogin() call. */
export function setActiveLoginCallback(cb: LoginCallback | null) {
  activeLoginCallback = cb;
}

