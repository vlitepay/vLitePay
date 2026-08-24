/**
 * Hand-written ABI for SendWithFee.sol — kept in sync manually with the
 * contract in /contracts/src/SendWithFee.sol. Once the contract is
 * compiled, swap this for the generated artifact ABI
 * (out/SendWithFee.sol/SendWithFee.json) to guarantee drift-free typing.
 */
export const sendWithFeeAbi = [
  {
    type: "function",
    name: "sendWithFee",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "recipient", type: "address" },
      { name: "netAmount", type: "uint256" },
      { name: "treasury", type: "address" },
      { name: "feeAmount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "event",
    name: "Sent",
    inputs: [
      { name: "sender", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "netAmount", type: "uint256", indexed: false },
      { name: "treasury", type: "address", indexed: false },
      { name: "feeAmount", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
] as const;
