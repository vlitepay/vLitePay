import { createConfig, http } from "wagmi";
import { walletConnect, injected } from "wagmi/connectors";
import { arcTestnet } from "./constants";
import { circleConnector } from "./circleConnector";

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

/**
 * Connectors, kept deliberately minimal.
 *
 * We only register two wagmi connectors:
 *   - `injected()`    — any browser wallet exposing an EIP-1193 provider
 *                        (MetaMask, Rabby, Coinbase Wallet's browser extension, etc.)
 *   - `walletConnect()` — QR/deeplink flow for mobile wallets, incl. Coinbase Wallet mobile
 *
 * We do NOT use wagmi's `coinbaseWallet` connector. Its underlying
 * `@coinbase/wallet-sdk` transitively drags in a heavy, unrelated dependency
 * chain:
 *
 *   coinbaseWallet() -> @coinbase/wallet-sdk -> @base-org/account
 *     -> @coinbase/cdp-sdk -> @x402/evm/<subpath>/client
 *
 * `@base-org/account` is Coinbase's Smart Wallet ("Base Account") SDK,
 * `@coinbase/cdp-sdk` is their Developer Platform embedded-wallet SDK, and
 * `@x402/evm` is Coinbase's brand-new x402 agent-payment protocol client —
 * none of which vLitePay uses. Depending on the installed version, that chain
 * resolves a different `@x402/evm/<subpath>` (seen: "upto/client",
 * "exact/client"), which isn't reliably bundlable and breaks `next dev` /
 * `next build` outright.
 *
 * Removing our own `coinbaseWallet()` call isn't enough on its own — wagmi's
 * `connectors` package re-exports every connector from one barrel file, so
 * that module is still reachable during webpack's resolution pass even
 * though we never call it. The real backstop lives in `next.config.js`,
 * which aliases the root packages of that chain to an empty module so no
 * subpath variant can break the build. Coinbase Wallet itself is NOT
 * dropped as a supported wallet — it still works perfectly via `injected()`
 * or WalletConnect, exactly like every other wallet.
 *
 * Circle Programmable Wallets (email/social login) is wired in as its own
 * connector — see ./circleConnector.ts and ./circle.ts. It uses Circle's
 * `@circle-fin/w3s-pw-web-sdk` Web SDK under the hood for PIN/biometric
 * confirmation, bridged through a custom wagmi connector so `useAccount()`
 * and every on-chain hook in the app work the same way for a Circle session
 * as they do for injected/WalletConnect wallets. It has no dependency on
 * Coinbase/Base/x402 packages whatsoever.
 */
export const wagmiConfig = createConfig({
  chains: [arcTestnet],
  connectors: [
    injected(),
    ...(walletConnectProjectId
      ? [
          walletConnect({
            projectId: walletConnectProjectId,
            metadata: {
              name: "vLitePay",
              description: "Premium P2P payments on Arc",
              url: "https://vlitepay.app",
              icons: ["/logo.png"],
            },
            showQrModal: true,
          }),
        ]
      : []),
    circleConnector(),
  ],
  transports: {
    [arcTestnet.id]: http(),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
