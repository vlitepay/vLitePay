import type { Metadata, Viewport } from "next";
// Fonts are bundled locally via @fontsource (same Inter / IBM Plex Mono
// families, same weights) instead of next/font/google, so the dev server
// never depends on reaching fonts.googleapis.com at startup. Static,
// discrete weight files are used (rather than a variable font) to match
// the exact optical sizing the app previously rendered with. The
// --font-inter / --font-mono CSS variables these previously exposed are now
// declared directly in globals.css, so Tailwind config and every component
// that reference them are unaffected.
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/inter/800.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { ActiveTradeBanner } from "@/components/p2p/ActiveTradeBanner";
import { AuthGate } from "@/components/auth/AuthGate";
import { AuthSync } from "@/components/auth/AuthSync";

export const metadata: Metadata = {
  title: "vLitePay — Borderless P2P Finance",
  description: "Send stablecoins, trade P2P for local fiat, and top up your phone — powered by USDC.",
  icons: { icon: "/logo.png", apple: "/logo.png" },
};

export const viewport: Viewport = {
  themeColor: "#0B0E1A",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="font-sans">
        <Providers>
          <AuthSync />
          <AuthGate>
            <Header />
            <main className="mx-auto max-w-md md:max-w-4xl px-4 pb-28 md:pb-12 pt-4">{children}</main>
            <ActiveTradeBanner />
            <BottomNav />
          </AuthGate>
        </Providers>
      </body>
    </html>
  );
}
