export const SignalRegistryABI = [
  // ── Events ─────────────────────────────────────────────────────────────────
  {
    type: "event",
    name: "SignalCommitted",
    inputs: [
      { name: "signalId",    type: "uint256", indexed: true },
      { name: "agent",       type: "address", indexed: true },
      { name: "signalHash",  type: "bytes32", indexed: false },
      { name: "expiration",  type: "uint256", indexed: false },
      { name: "stakeAmount", type: "uint256", indexed: false },
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
  {
    type: "event",
    name: "SignalSettled",
    inputs: [
      { name: "signalId", type: "uint256", indexed: true },
      { name: "agent",    type: "address", indexed: true },
      { name: "accurate", type: "bool",    indexed: false },
      { name: "pnlBps",   type: "int256",  indexed: false },
    ],
  },
  {
    type: "event",
    name: "SignalExpired",
    inputs: [{ name: "signalId", type: "uint256", indexed: true }],
  },
  {
    type: "event",
    name: "SettlerUpdated",
    inputs: [{ name: "newSettler", type: "address", indexed: true }],
  },
  // ── Write functions ─────────────────────────────────────────────────────────
  {
    type: "function",
    name: "commitSignal",
    stateMutability: "payable",
    inputs: [
      { name: "signalHash", type: "bytes32" },
      { name: "expiration", type: "uint256" },
    ],
    outputs: [{ name: "signalId", type: "uint256" }],
  },
  {
    type: "function",
    name: "revealSignal",
    stateMutability: "nonpayable",
    inputs: [
      { name: "signalId",   type: "uint256" },
      { name: "rawPayload", type: "string" },
      { name: "salt",       type: "string" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "settleSignal",
    stateMutability: "nonpayable",
    inputs: [
      { name: "signalId", type: "uint256" },
      { name: "accurate", type: "bool" },
      { name: "pnlBps",   type: "int256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "markExpired",
    stateMutability: "nonpayable",
    inputs: [{ name: "signalId", type: "uint256" }],
    outputs: [],
  },
  // ── View functions ──────────────────────────────────────────────────────────
  {
    type: "function",
    name: "getSignal",
    stateMutability: "view",
    inputs: [{ name: "signalId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "signalHash",  type: "bytes32" },
          { name: "agent",       type: "address" },
          { name: "expiration",  type: "uint256" },
          { name: "committedAt", type: "uint256" },
          { name: "stakeAmount", type: "uint256" },
          { name: "status",      type: "uint8" },
          { name: "accurate",    type: "bool" },
          { name: "pnlBps",      type: "int256" },
          { name: "rawPayload",  type: "string" },
        ],
      },
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
    name: "settler",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "minStake",
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
  // ── Admin ───────────────────────────────────────────────────────────────────
  {
    type: "function",
    name: "setSettler",
    stateMutability: "nonpayable",
    inputs: [{ name: "newSettler", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "setMinStake",
    stateMutability: "nonpayable",
    inputs: [{ name: "newMinStake", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdrawFunds",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to",     type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

export type SignalStatus = 0 | 1 | 2 | 3; // Pending | Revealed | Settled | Expired

export interface OnChainSignal {
  signalHash:  string;
  agent:       string;
  expiration:  bigint;
  committedAt: bigint;
  stakeAmount: bigint;
  status:      SignalStatus;
  accurate:    boolean;
  pnlBps:      bigint;
  rawPayload:  string;
}
