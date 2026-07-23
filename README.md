<img width="1056" height="976" alt="logo" src="https://github.com/user-attachments/assets/b2dd0bc3-86df-45d9-b1ad-d2f44e2c0c61" />
# vLitePay

(https://raw.githubusercontent.com/vLitePay/vLitePay/main/vlitepay-logo.png)

**Borderless P2P Finance, Built for Speed and Trust**

A stablecoin-native P2P payments and trading dApp built on **Arc testnet** (Circle's L1). Enables fast, secure USDC/EURC trading with on-chain escrow, seamless airtime/data top-ups via Reloadly, and cross-chain transfers via CCTP.

## ✨ Features

- **Secure P2P Escrow Trading** — Buy/sell USDC/EURC for local fiat with time-bound escrow, "I have sent fiat" flow, auto-release, and trusted arbiter for disputes
- **Instant Airtime & Data Top-ups** — Seamless Reloadly integration (webhook-driven, liquidity management)
- **Cross-Chain USDC Transfers** — CCTP support with chain selector and Fast Transfers (Base, Ethereum, Arbitrum, etc.)
- **Modern User Experience** — Next.js 15 App Router + Zustand state management, premium portfolio charts, visible balances, mobile-responsive, dark/light theme
- **Username Registry & Referrals** — On-chain username-to-wallet mapping + off-chain referral program (rewards for tasks, volume, etc.)
- **Real-time Elements** — Supabase for auth, chats, attachments, and persistence
- **Trust & Compliance Focus** — Clear T&Cs, disclaimers (users/merchants handle KYC/AML), transparent fees

---

## 🛠️ Tech Stack

### Smart Contracts
- **Foundry** (Solidity ^0.8.20)
- Arc testnet (Chain ID: 5042002, USDC native gas)
- viem / wagmi for interactions
- Escrow contracts with timers, flags, arbiter resolution, and fees

### Frontend
- Next.js 15 (App Router) + TypeScript + Tailwind CSS
- Zustand for state management
- WalletConnect + Circle SDK (Programmable Wallets, email/social login)
- html5-qrcode for QR scanning/generation

### Backend & Integrations
- Supabase (auth, database, storage, realtime)
- Node.js/Express for Reloadly webhooks and referral logic
- Circle CCTP, Reloadly API, CoinGecko/Frankfurter for rates

---

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- Foundry (install via `curl -L https://foundry.paradigm.xyz | bash`)
- Supabase account
- Reloadly account (for airtime integration)

### Setup

1. **Clone the repo**
   ```bash
   git clone https://github.com/v/vLitePay.git
   cd vLitePay
