/**
 * Minimal ABI for Circle's CCTP MessageTransmitter — just the one function
 * the server relayer fallback needs (app/api/cctp/relay/route.ts). This is
 * the standard, stable CCTP message-completion call used identically
 * across CCTP V1 and V2 on every EVM destination chain: submit the raw
 * message bytes Circle's Iris API returned alongside its signed
 * attestation, and the contract mints USDC to whatever address was
 * encoded as mintRecipient in the original depositForBurn call.
 *
 * Only needed for the FALLBACK (non-forwarding) path — when Circle's
 * Forwarding Service is used instead (depositForBurnWithHook, see
 * lib/abi/tokenMessenger.ts), Circle calls this on our behalf and our
 * server never needs to.
 */
export const messageTransmitterAbi = [
  {
    type: "function",
    name: "receiveMessage",
    stateMutability: "nonpayable",
    inputs: [
      { name: "message", type: "bytes" },
      { name: "attestation", type: "bytes" },
    ],
    outputs: [{ name: "success", type: "bool" }],
  },
] as const;
