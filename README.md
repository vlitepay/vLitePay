# vLitePay

**Borderless P2P Finance, Built for Speed and Trust**

Premium P2P stablecoin dApp.
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

- **Wallet Support** — WalletConnect, injected wallets + Circle Programmable Wallets (email login)

- **Home** — live on-chain USDC/EURC/cirBTC balances, 7d/30d portfolio chart (area + allocation
pie), quick actions, live-trade social proof feed.

- **Transfer & Deposit** — Send by username or address, QR support, same-chain + cross-chain USDC via CCTP

- **P2P Trading** — Escrow-based Buy/Sell offers with fiat, timers, disputes, ratings, and merchant mini-chat

- **MyShop** — merchant application flow, offer posting, pause/resume, and per-offer performance
stats (views/trades/volume).

- **Top Up** — Airtime & data top-ups via Reloadly (Africa, Asia and beyond)

- **Username Registry** — On-chain username → wallet resolution

- **Profile** — editable avatar, bio, social links, bank details per region/currency, on-chain P2P
trade history (replayed from `TradeLocked` logs), and a merchant application shortcut.

- **Admin & Merchant Tools** — Offer management, dispute resolution, fee configuration, add arbiter

- **FAQ & Support** 

- **Notifications**

- **Modern UI** — Dark/light mode, glassmorphism, portfolio chart, mobile-first
---

## Known Limitations (Testnet)

• Profile data (avatar, bio, bank details) is currently stored locally in the browser.

• AI receipt analyzer for disputes is still simulated.

• Payment proofs and trade chat messages are stored client-side for the MVP (will move to Supabase).

• Some advanced merchant and referral features are not yet fully active.

---

## Disclaimer
vLitePay is a technology platform only. Users and merchants are responsible for
their own KYC/AML compliance in all fiat-touching flows.
