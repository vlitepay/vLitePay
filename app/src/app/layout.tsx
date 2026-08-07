import type { Metadata, Viewport } from "next";
import { Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { ActiveTradeBanner } from "@/components/p2p/ActiveTradeBanner";
import { AuthGate } from "@/components/auth/AuthGate";
import { AuthSync } from "@/components/auth/AuthSync";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "vLitePay — Premium P2P payments on Arc",
  description: "Send stablecoins, trade P2P for local fiat, and top up your phone — powered by Circle on Arc Testnet.",
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
      <body className={`${inter.variable} ${plexMono.variable} font-sans`}>
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
