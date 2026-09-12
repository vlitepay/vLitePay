/**
 * ABI for Circle's CCTP V2 TokenMessengerV2, matching
 * /contracts/src/interfaces/ITokenMessenger.sol. Used by the Send flow to
 * burn USDC on Arc for minting on a destination chain, without routing
 * through P2PEscrow (which only exposes CCTP payouts tied to a trade).
 *
 * IMPORTANT: TokenMessengerV2 (deployed on Arc Testnet) does NOT reliably
 * support the legacy V1-style 4-arg depositForBurn(amount, destinationDomain,
 * mintRecipient, burnToken) selector — calling it reverts almost immediately
 * (observed: ~249 gas used before revert, consistent with the proxy's
 * dispatcher not recognizing that selector at all). V2 requires the 7-arg
 * fast-transfer signature below, even for a "standard" transfer — just set
 * `minFinalityThreshold` to the standard value (2000) instead of fast (1000)
 * if soft finality isn't desired.
 */
export const tokenMessengerAbi = [
  {
    type: "function",
    name: "depositForBurn",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "maxFee", type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32" },
    ],
    outputs: [{ name: "nonce", type: "uint64" }],
  },
  /**
   * Circle's Forwarding Service variant — identical to depositForBurn but
   * with an appended `hookData`. When hookData is the reserved
   * "cctp-forward" magic-bytes payload (FORWARDING_SERVICE_HOOK_DATA
   * below), Circle itself signs the attestation AND submits the mint
   * transaction on the destination chain automatically — no server-side
   * relayer needed. Verified against Circle's own docs, including a
   * worked Arc-specific example:
   * https://developers.circle.com/cctp/howtos/transfer-usdc-with-forwarding-service
   * https://developers.circle.com/cctp/quickstarts/transfer-usdc-ethereum-to-arc
   */
  {
    type: "function",
    name: "depositForBurnWithHook",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "destinationDomain", type: "uint32" },
      { name: "mintRecipient", type: "bytes32" },
      { name: "burnToken", type: "address" },
      { name: "destinationCaller", type: "bytes32" },
      { name: "maxFee", type: "uint256" },
      { name: "minFinalityThreshold", type: "uint32" },
      { name: "hookData", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

/**
 * Reserved Forwarding Service hook payload — magic bytes "cctp-forward" +
 * hook version (0) + additional-data length (0). This is Circle's exact
 * documented static hex string for "just forward this transfer, no extra
 * integrator hook logic" — not something invented here. Circle explicitly
 * requires `destinationCaller: bytes32(0)` alongside this (forwarding
 * "doesn't support forwarding to wrapper contracts") — see
 * FORWARDING_DESTINATION_CALLER below.
 */
export const FORWARDING_SERVICE_HOOK_DATA =
  "0x636374702d666f72776172640000000000000000000000000000000000000000" as const;

/** bytes32(0) — required by the Forwarding Service; also the existing "any caller can mint" convention already used by the plain depositForBurn call in hooks/useSend.ts. */
export const FORWARDING_DESTINATION_CALLER = `0x${"0".repeat(64)}` as const;

/** Circle CCTP V2 finality threshold constants — see Circle's CCTP V2 technical guide. */
export const CCTP_FINALITY_THRESHOLD = {
  FAST: 1000, // soft finality, ~8-20s attestation
  STANDARD: 2000, // hard finality, waits for full confirmation
} as const;
