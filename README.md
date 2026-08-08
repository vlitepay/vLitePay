# vLitePay

**Borderless P2P Finance, Built for Speed and Trust**

Premium P2P stablecoin dApp on **Arc Testnet**.  
Send USDC/EURC/cirBTC, trade P2P for local fiat with merchants, top up airtime/data, and move USDC cross-chain via Circle CCTP.

🔗 **Live Demo**: [https://vlitepay.com](https://vlitepay.com)

📦 **GitHub**: [https://github.com/vlitepay/vLitePay](https://github.com/vlitepay/vLitePay)

---

## Tech Stack

| Layer          | Stack                                      |
|----------------|--------------------------------------------|
| Smart Contracts| Foundry (Solidity 0.8.20+)                 |
| Frontend       | Next.js 15, TypeScript, Tailwind, Zustand, wagmi + viem |
| Backend        | Node.js + Express (Reloadly webhooks)      |
| Auth / Wallets | WalletConnect + Circle Programmable Wallets|
| Network        | Arc Testnet (Chain ID: `5042002`)          |

---

## Arc Testnet Info

| Item              | Value                                      |
|-------------------|--------------------------------------------|
| Chain ID          | `5042002`                                  |
| RPC               | `https://rpc.testnet.arc.network`          |
| Explorer          | [testnet.arcscan.app](https://testnet.arcscan.app) |
| Native Gas Token  | USDC (6 decimals)                          |
| Faucet            | [faucet.circle.com](https://faucet.circle.com) (select Arc Testnet) |

### Contract Addresses (Arc Testnet)

| Contract            | Address |
|---------------------|---------|
| UsernameRegistry    | _0x61941A73385F249A0eD496b8F62057f602beCb21_ |
| P2PEscrow           | _0xb25F3F073Be7889da5ad797F923893e0F4196526_ |
| USDC                | `0x3600000000000000000000000000000000000000` |
| EURC                | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| cirBTC              | `0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF` |



---
## 1. Smart contracts (Foundry)

### Prerequisites
- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge`, `cast`, `anvil`)

### Setup
```bash
cd contracts
forge install foundry-rs/forge-std --no-commit
forge install OpenZeppelin/openzeppelin-contracts --no-commit
cp .env.example .env   # fill in PRIVATE_KEY etc.
forge build
forge test -vvv
```

### Deploy
```bash
cd contracts
source .env
forge script script/Deploy.s.sol:Deploy \
  --rpc-url arc_testnet \
  --broadcast \
  --verify -vvvv
```
This deploys `UsernameRegistry` and `P2PEscrow`, wires up supported tokens
(USDC/EURC/cirBTC), seeds initial fiat pairs (NGN, PHP, EUR, USD, KES, GHS),
and registers CCTP destination domains


---
## 2. Frontend (Next.js 15 + wagmi + Circle Wallets)

```bash
cd app
npm install
cp .env.example .env.local   # fill in contract addresses, WalletConnect project id, Circle keys
npm run dev
```
Open http://localhost:3000.


---

## 3. Backend (Express — Reloadly webhooks + uploads)

```bash
cd backend
npm install
cp .env.example .env   # Reloadly sandbox client id/secret, webhook signing secret
npm run dev
```


Environment Variables
Frontend (app/.env.local)
•  NEXT_PUBLIC_ARC_RPC_URL
•  NEXT_PUBLIC_USERNAME_REGISTRY_ADDRESS
•  NEXT_PUBLIC_P2P_ESCROW_ADDRESS
•  NEXT_PUBLIC_CCTP_TOKEN_MESSENGER_ADDRESS
•  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
•  NEXT_PUBLIC_CIRCLE_APP_ID
•  CIRCLE_API_KEY (server-side)
•  NEXT_PUBLIC_BACKEND_URL

Backend (backend/.env)
•  RELOADLY_CLIENT_ID / RELOADLY_CLIENT_SECRET
•  Webhook secret


## Features implemented

- **Auth gate** — the entire app is wallet-gated: a full-screen connect/email-login experience (with
the glowing "V" logo front and center) is the only thing rendered until a wallet connects or a
Circle email session completes; only then does the header, nav, and the rest of the app mount.

- **Wallet & auth** — WalletConnect / injected / Coinbase via wagmi, plus a Circle Programmable
Wallets email-login scaffold (backend token issuance stubbed, ready for real Circle API keys).

- **Home** — live on-chain USDC/EURC/cirBTC balances, 7d/30d portfolio chart (area + allocation
pie), quick actions, live-trade social proof feed.

- **Transfer & Deposit** — send by username or address (with QR scanning via device camera),
same-chain transfers with a configurable protocol fee, cross-chain USDC sends via Circle CCTP
with a destination-chain selector, deposit QR codes per token, on-chain username registry
(register/search/lookup).

- **P2P trading** — currency-pair browsing, buy/sell offer lists, offer detail with live
balance/USD/fiat display before locking escrow, full escrow lifecycle (lock → fiat-marked →
release/dispute/cancel), a persistent active-trade banner, merchant mini-chat with payment-proof
uploads, disputes, and post-trade 1–5 star ratings with a confetti celebration.

- **Maker/taker P2P fees** — independently configurable: a **maker fee (default 1%)** charged to
whoever deposits crypto into escrow (the merchant on a `MerchantSells` offer, or the taker on a
`MerchantBuys` offer — the fee follows the deposit, not the offer poster, by design), added on
top of the trade amount they lock; and a **taker fee (default 0%)** that would be deducted from
the buyer's payout if the owner ever sets it above zero. Both are snapshotted on the trade at
accept time so a later fee change never affects an already-locked trade, both survive dispute
resolution (the maker fee always reaches treasury; the taker fee scales with whatever share the
buyer is actually awarded), and a cancelled trade refunds the depositor in full, fee included.
The exact split is always shown before the trade is accepted — buyer sees "no fee for you" when
the taker fee is 0%, and the depositor sees the fee added to their total debit line.

- **Profile** — editable avatar, bio, social links, bank details per region/currency, on-chain P2P
trade history (replayed from `TradeLocked` logs), and a merchant application shortcut.

- **MyShop** — merchant application flow, offer posting, pause/resume, and per-offer performance
stats (views/trades/volume).

- **Admin** — owner/arbiter-gated merchant management, dispute dashboard (with a simulated AI
receipt analyzer — see limitations below), and protocol settings (fees, timers, arbiters,
supported tokens/fiat).

- **Top Up** (formerly "Airtime", route `/topup`) — Reloadly sandbox integration: country selector,
live network-operator lookup per country (MTN, Glo, 9mobile, etc. — fetched from Reloadly), an
Airtime/Data toggle (distinguishing phone credit from data bundles within the Top Up flow), fixed package
selection (with data-bundle descriptions where Reloadly provides them) plus a custom-amount
fallback, USDC/EURC payment with live fee math, and a backend webhook handler.

- **FAQ & Support** — a searchable glassmorphism FAQ page with detailed step-by-step guides for the
P2P trade flow, becoming a merchant, dispute resolution, and how the escrow timer/release works,
plus a team contact card (email + social links) that's editable by the owner from Admin > Settings.
Linked from Profile.

- **Notifications** — a bell icon in the header with a glassmorphism dropdown of recent activity,
unread badge count, and browser push notifications (with a permission-request prompt). Covers
every key activity: P2P trade lifecycle (offer accepted, funds locked, fiat sent, release,
dispute, rating — including passive updates for whichever party didn't trigger the action),
top-up (airtime/data) success and failure, merchant application submission and a one-time approval
notification, username registration, and same-chain/CCTP cross-chain sends. Persisted via Zustand.

---

## Known Limitations (Testnet)

•  Circle email login is UI-complete. Full on-chain actions currently work best with WalletConnect / injected wallets.

•  Profile data (avatar, bio, bank details) is currently local to the browser.

•  AI receipt analyzer for disputes is simulated.

•  Payment proofs are stored client-side for the MVP.

---

## Disclaimer
vLitePay is a technology platform only. Users and merchants are responsible for
their own KYC/AML compliance in all fiat-touching flows.
