export const SubscriptionPassABI = [
  // ── Events ─────────────────────────────────────────────────────────────────
  {
    type: "event",
    name: "PassPurchased",
    inputs: [
      { name: "subscriber", type: "address", indexed: true },
      { name: "tier",       type: "uint8",   indexed: false },
      { name: "expiresAt",  type: "uint256", indexed: false },
      { name: "price",      type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RevenueWithdrawn",
    inputs: [
      { name: "to",     type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "TransferSingle",
    inputs: [
      { name: "operator", type: "address", indexed: true },
      { name: "from",     type: "address", indexed: true },
      { name: "to",       type: "address", indexed: true },
      { name: "id",       type: "uint256", indexed: false },
      { name: "value",    type: "uint256", indexed: false },
    ],
  },
  // ── Write functions ─────────────────────────────────────────────────────────
  {
    type: "function",
    name: "purchase",
    stateMutability: "nonpayable",
    inputs: [{ name: "tier", type: "uint8" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdrawRevenue",
    stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "setURI",
    stateMutability: "nonpayable",
    inputs: [{ name: "newURI", type: "string" }],
    outputs: [],
  },
  // ── View functions ──────────────────────────────────────────────────────────
  {
    type: "function",
    name: "isActive",
    stateMutability: "view",
    inputs: [{ name: "subscriber", type: "address" }],
    outputs: [
      { name: "active",    type: "bool" },
      { name: "tier",      type: "uint8" },
      { name: "expiresAt", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "tierConfig",
    stateMutability: "pure",
    inputs: [{ name: "tier", type: "uint8" }],
    outputs: [
      { name: "price",    type: "uint256" },
      { name: "duration", type: "uint256" },
      { name: "name",     type: "string" },
    ],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      { name: "account", type: "address" },
      { name: "id",      type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "usdt",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "totalRevenue",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "TIER_BASIC",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "TIER_PRO",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "TIER_ELITE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "function",
    name: "PRICE_BASIC",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "PRICE_PRO",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "PRICE_ELITE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

export interface SubscriptionPassStatus {
  active:    boolean;
  tier:      number;   // 0 = none, 1 = basic, 2 = pro, 3 = elite
  expiresAt: bigint;
}

export const SUBSCRIPTION_TIERS = {
  BASIC: 1,
  PRO:   2,
  ELITE: 3,
} as const;

export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[keyof typeof SUBSCRIPTION_TIERS];
