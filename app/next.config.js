/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "**" }],
  },
  webpack: (config) => {
    // --- Why this exists ---
    // wagmi's `connectors` package re-exports EVERY connector (injected,
    // walletConnect, coinbaseWallet, metaMask, safe, etc.) from one barrel
    // entry file. Even though vLitePay only *uses* `injected` and
    // `walletConnect` (see src/lib/wagmi-config.ts), that barrel file still
    // statically imports every other connector's module internally. Webpack
    // has to resolve every statically-imported module reachable from our
    // code — regardless of which named exports we actually consume — so
    // each unused connector's own heavy/optional dependencies get pulled
    // into resolution anyway. Two concrete chains we've hit so far:
    //
    //   wagmi/connectors (barrel)
    //     -> coinbaseWallet connector -> @coinbase/wallet-sdk
    //       -> @base-org/account (Coinbase "Base Account" / Smart Wallet SDK)
    //         -> @coinbase/cdp-sdk (Coinbase Developer Platform embedded-wallet SDK)
    //           -> @x402/evm/<subpath>/client  (x402 agent-payment protocol)
    //
    //   wagmi/connectors (barrel)
    //     -> metaMask connector -> @metamask/sdk
    //       -> @react-native-async-storage/async-storage (React Native only —
    //          MetaMask SDK feature-detects the platform at runtime and never
    //          touches this in a browser/Next.js context, but webpack still
    //          needs the file to exist to resolve the static import)
    //
    // Rather than chase each new subpath/package one at a time as new wagmi
    // versions ship, we alias the *root* package of each known-safe-to-stub
    // chain. Without a trailing `$`, webpack's alias matching covers every
    // subpath underneath them too. This is safe precisely because none of
    // these packages' code ever actually executes in vLitePay (we never call
    // Coinbase Smart Wallet / CDP / x402 / MetaMask-SDK-specific APIs) — it
    // only stops webpack from failing to *resolve* files that are
    // unreachable dead code for our app.
    //
    // If a future `npm install` surfaces a *new* "Module not found" error
    // from yet another connector we don't use, the fix is the same pattern:
    // find the root optional package causing it and add it below.
    // One more in the same family: WalletConnect's own logger (pino) has an
    // optional pretty-printer (pino-pretty) it only loads in a non-browser,
    // dev-pretty-print mode we never trigger. Same treatment.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@base-org/account": false,
      "@coinbase/cdp-sdk": false,
      "@x402/evm": false,
      "@x402/fetch": false,
      "@react-native-async-storage/async-storage": false,
      "pino-pretty": false,
    };
    return config;
  },
};

module.exports = nextConfig;
