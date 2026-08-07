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
] as const;

/** Circle CCTP V2 finality threshold constants — see Circle's CCTP V2 technical guide. */
export const CCTP_FINALITY_THRESHOLD = {
  FAST: 1000, // soft finality, ~8-20s attestation
  STANDARD: 2000, // hard finality, waits for full confirmation
} as const;
