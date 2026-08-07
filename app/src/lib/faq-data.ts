export interface FaqItem {
  id: string;
  question: string;
  answer: string; // plain text with \n for paragraph breaks; numbered steps use "1. " etc.
}

export interface FaqCategory {
  id: string;
  title: string;
  icon: "trade" | "merchant" | "dispute" | "escrow" | "wallet" | "fees";
  items: FaqItem[];
}

export const FAQ_CATEGORIES: FaqCategory[] = [
  {
    id: "p2p-trade",
    title: "P2P trade flow",
    icon: "trade",
    items: [
      {
        id: "trade-how-it-works",
        question: "How does a P2P trade work, step by step?",
        answer:
          "1. Browse offers for a currency pair (e.g. USDC → NGN) on the P2P tab, filtered by Buy or Sell.\n" +
          "2. Open an offer to see the merchant's rate, limits, and terms.\n" +
          "3. Enter an amount — you'll see your live balance, the USD equivalent, and the fiat equivalent before you commit to anything.\n" +
          "4. Choose a release window (24h default or 48h) and tap Accept Offer. This locks the crypto side of the trade in the P2PEscrow smart contract.\n" +
          "5. Send the fiat payment to the merchant using the bank/payment details you agree on in the trade chat, then tap \"I have sent the fiat.\"\n" +
          "6. The other party verifies the fiat arrived and taps \"Release funds,\" which sends the escrowed crypto to the buyer.\n" +
          "7. Both sides can leave a 1–5 star rating once the trade completes.",
      },
      {
        id: "trade-who-locks-funds",
        question: "Whose crypto actually gets locked in escrow?",
        answer:
          "It depends on the offer side. If a merchant is selling crypto, their crypto is locked in escrow the moment you accept their offer (they approved the contract in advance when posting it). If a merchant is buying crypto, you — as the person accepting — lock your own crypto when you accept. Either way, the crypto sits in the P2PEscrow contract, not in anyone's wallet, until release, cancellation, or dispute resolution.",
      },
      {
        id: "trade-cancel",
        question: "Can I cancel a trade?",
        answer:
          "Yes, but only before the fiat has been marked as sent. Either party can cancel a trade while it's still in the \"Locked\" state, and the escrowed crypto is returned to whoever deposited it. Once fiat has been marked sent, cancellation is no longer available — at that point the options are release or dispute.",
      },
      {
        id: "trade-chat",
        question: "What's the trade chat for?",
        answer:
          "Each trade has its own mini-chat where you and the counterparty can confirm payment details and attach a screenshot of the payment as proof once you've sent the fiat. It's meant to give both sides (and an arbiter, if a dispute is raised) a clear record of what was agreed and sent.",
      },
      {
        id: "trade-ratings",
        question: "How do ratings work?",
        answer:
          "After a trade is released or resolved, each participant can leave a 1–5 star rating with an optional comment for the other party — you can only rate a given trade once. Ratings feed into a merchant's visible track record on their offers, so honest, specific feedback helps everyone trading on vLitePay.",
      },
    ],
  },
  {
    id: "merchant",
    title: "Becoming a merchant",
    icon: "merchant",
    items: [
      {
        id: "merchant-apply",
        question: "How do I become a merchant?",
        answer:
          "Head to Profile or the P2P → MyShop tab and tap Apply. Before applying, reach out to the team using the contact links shown right above the Apply button — verification happens through that conversation, not automatically. Once you've applied on-chain, your application sits as \"pending\" until the vLitePay team reviews and approves it.",
      },
      {
        id: "merchant-approval",
        question: "What happens after I apply?",
        answer:
          "The team reviews pending applications from the admin panel. If you're approved, you'll get an in-app (and, where enabled, browser push) notification the next time the app checks your status, and MyShop unlocks so you can post your first offer. There's no fixed SLA in this build — reaching out directly (see the contact links) is the fastest way to move things along.",
      },
      {
        id: "merchant-myshop",
        question: "What can I do once I'm approved?",
        answer:
          "In MyShop you can post new Buy or Sell offers with your own rate, min/max limits, and terms; pause or resume any offer without deleting it; and see per-offer performance — views, completed trades, and total volume — so you know which offers are working.",
      },
      {
        id: "merchant-restricted",
        question: "Can a merchant be restricted or removed?",
        answer:
          "Yes. The team can restrict a merchant's ability to post or manage offers from the admin panel if there's a pattern of complaints, disputes, or policy violations. Existing trades already in escrow aren't affected by a restriction — they still run through to release, cancellation, or dispute resolution normally.",
      },
    ],
  },
  {
    id: "disputes",
    title: "Disputes",
    icon: "dispute",
    items: [
      {
        id: "dispute-when",
        question: "When should I raise a dispute?",
        answer:
          "Raise a dispute if you've sent fiat and the other party isn't responding or won't release the funds, if you believe the counterparty is acting in bad faith, or if there's a genuine disagreement about whether payment was received. You can raise a dispute any time a trade is in the \"Locked\" or \"Fiat marked sent\" state — the escrowed funds stay locked in the contract the moment a dispute is opened, so nothing can be released unilaterally while it's under review.",
      },
      {
        id: "dispute-process",
        question: "What happens after I raise a dispute?",
        answer:
          "Your dispute, along with the trade chat and any payment proof attached, becomes visible to vLitePay's arbiters in the admin dispute dashboard. An arbiter reviews the evidence and decides how to split the escrowed funds between the buyer and seller — this can be a full award to one side or a partial split, depending on what the evidence shows. Once resolved, the funds move automatically and the trade is marked Resolved.",
      },
      {
        id: "dispute-evidence",
        question: "What evidence should I provide?",
        answer:
          "A payment receipt or screenshot attached in the trade chat is the most useful single piece of evidence. Keep your dispute description factual and specific — timestamps, amounts, and what was actually communicated matter far more than general statements about the other party.",
      },
      {
        id: "dispute-outcome",
        question: "Is a dispute resolution final?",
        answer:
          "Yes — once an arbiter resolves a dispute, the fund split executes immediately and the trade moves to a Resolved state. There isn't an in-app appeals flow in this build, so it's worth providing your strongest evidence up front rather than after a decision has been made.",
      },
    ],
  },
  {
    id: "escrow",
    title: "Escrow timer & release",
    icon: "escrow",
    items: [
      {
        id: "escrow-timer",
        question: "How does the escrow timer work?",
        answer:
          "When you accept an offer, you choose a release window — 24 hours by default, or 48 hours if you need more time. That window starts counting down the moment the trade locks, and you can see it live as a countdown ring on the trade page. It's the amount of time the buyer has to send fiat and get it marked as sent before the window is considered expired.",
      },
      {
        id: "escrow-expired",
        question: "What happens if the timer runs out?",
        answer:
          "If the window expires while a trade is still \"Locked\" (fiat never marked as sent), the buyer can no longer mark fiat as sent through the normal flow, and either party should raise a dispute so an arbiter can review what happened and resolve it fairly. The crypto stays safely in escrow the entire time — an expired timer never causes funds to move automatically in either direction.",
      },
      {
        id: "escrow-release-fast",
        question: "How fast is release once the seller confirms?",
        answer:
          "As soon as the seller taps \"Release funds\" after verifying the fiat payment, it's a single on-chain transaction — the buyer receives the crypto (minus the protocol fee) as soon as that transaction confirms on Arc, typically within seconds.",
      },
      {
        id: "escrow-fees",
        question: "Is there a fee on P2P trades?",
        answer:
          "Yes, a small protocol fee (0.25% by default, and always shown before you accept an offer) is taken from the escrowed amount at release and sent to the vLitePay treasury. The exact rate is configurable by the vLitePay team and is always displayed in the amount breakdown before you lock funds — nothing is hidden after the fact.",
      },
    ],
  },
];
