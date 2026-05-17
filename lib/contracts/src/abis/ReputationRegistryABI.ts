export const ReputationRegistryABI = [
  // ── Events ─────────────────────────────────────────────────────────────────
  {
    type: "event",
    name: "ScorerUpdated",
    inputs: [{ name: "scorer", type: "address", indexed: true }],
  },
  {
    type: "event",
    name: "ReputationUpdated",
    inputs: [
      { name: "agent", type: "address", indexed: true },
      { name: "reputationScore", type: "uint256", indexed: false },
      { name: "totalSignals", type: "uint256", indexed: false },
    ],
  },
  // ── Write functions ─────────────────────────────────────────────────────────
  {
    type: "function",
    name: "setScorer",
    stateMutability: "nonpayable",
    inputs: [{ name: "newScorer", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "recordSettlement",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agent", type: "address" },
      { name: "accurate", type: "bool" },
      { name: "pnlBps", type: "int256" },
      { name: "signalId", type: "uint256" },
    ],
    outputs: [],
  },
  // ── View functions ──────────────────────────────────────────────────────────
  {
    type: "function",
    name: "getReputation",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "totalSignals", type: "uint256" },
          { name: "settledSignals", type: "uint256" },
          { name: "accurateSignals", type: "uint256" },
          { name: "cumulativePnlBps", type: "int256" },
          { name: "reputationScore", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getScore",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getSettlement",
    stateMutability: "view",
    inputs: [{ name: "signalId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "agent", type: "address" },
          { name: "accurate", type: "bool" },
          { name: "pnlBps", type: "int256" },
          { name: "signalId", type: "uint256" },
          { name: "recordedAt", type: "uint256" },
          { name: "reputationScore", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "signalRecorded",
    stateMutability: "view",
    inputs: [{ name: "signalId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "scorer",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

export interface OnChainReputation {
  totalSignals: bigint;
  settledSignals: bigint;
  accurateSignals: bigint;
  cumulativePnlBps: bigint;
  reputationScore: bigint;
}
