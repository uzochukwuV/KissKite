export const SignalRegistryABI = [
  // ── Events ─────────────────────────────────────────────────────────────────
  {
    type: "event",
    name: "SignalCommitted",
    inputs: [
      { name: "signalId",   type: "uint256", indexed: true },
      { name: "agent",      type: "address", indexed: true },
      { name: "hash",       type: "bytes32", indexed: false },
      { name: "expiration", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SignalRevealed",
    inputs: [
      { name: "signalId",   type: "uint256", indexed: true },
      { name: "agent",      type: "address", indexed: true },
      { name: "rawPayload", type: "string",  indexed: false },
    ],
  },
  // ── Write functions ─────────────────────────────────────────────────────────
  {
    type: "function",
    name: "commitSignal",
    stateMutability: "nonpayable",
    inputs: [
      { name: "hash",       type: "bytes32" },
      { name: "expiration", type: "uint256" },
    ],
    outputs: [{ name: "signalId", type: "uint256" }],
  },
  {
    type: "function",
    name: "revealSignal",
    stateMutability: "nonpayable",
    inputs: [
      { name: "onChainId",  type: "uint256" },
      { name: "rawPayload", type: "string" },
      { name: "salt",       type: "string" },
    ],
    outputs: [],
  },
  // ── View functions ──────────────────────────────────────────────────────────
  {
    type: "function",
    name: "getSignal",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      { name: "hash",        type: "bytes32" },
      { name: "agent",       type: "address" },
      { name: "committedAt", type: "uint256" },
      { name: "expiration",  type: "uint256" },
      { name: "revealed",    type: "bool" },
    ],
  },
  {
    type: "function",
    name: "getAgentSignalIds",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "", type: "uint256[]" }],
  },
  {
    type: "function",
    name: "getAgentSignalCount",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "nextSignalId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "hashCommitted",
    stateMutability: "view",
    inputs: [{ name: "hash", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export interface OnChainSignal {
  hash:        string;
  agent:       string;
  committedAt: bigint;
  expiration:  bigint;
  revealed:    boolean;
}
