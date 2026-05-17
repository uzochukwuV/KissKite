export const SIGNAL_REGISTRY_ADDRESS = '0x0788984E48c5A834C642FF7d60870b6209ad19c5' as const;
export const SUBSCRIPTION_PASS_ADDRESS = '0x11B50f35eAA67fEE0943d26351EC1E8E0840b931' as const;
export const REPUTATION_REGISTRY_ADDRESS = '0xdb0cd1182C5990077321B95357ae62a25FA1f0D8' as const;
export const USDT_ADDRESS = '0x0fF5393387ad2f9f691FD6Fd28e07E3969e27e63' as const;
export const KITE_CHAIN_ID = 2368 as const;
export const KITE_EXPLORER = 'https://explorer-testnet.gokite.ai';

export const SubscriptionPassABI = [
  { type: "event", name: "PassPurchased", inputs: [{ name: "subscriber", type: "address", indexed: true }, { name: "tier", type: "uint8", indexed: false }, { name: "expiresAt", type: "uint256", indexed: false }, { name: "price", type: "uint256", indexed: false }] },
  { type: "event", name: "RevenueWithdrawn", inputs: [{ name: "to", type: "address", indexed: true }, { name: "amount", type: "uint256", indexed: false }] },
  { type: "function", name: "purchase", stateMutability: "nonpayable", inputs: [{ name: "tier", type: "uint8" }], outputs: [] },
  { type: "function", name: "withdrawRevenue", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }], outputs: [] },
  { type: "function", name: "isActive", stateMutability: "view", inputs: [{ name: "subscriber", type: "address" }], outputs: [{ name: "active", type: "bool" }, { name: "tier", type: "uint8" }, { name: "expiresAt", type: "uint256" }] },
  { type: "function", name: "tierConfig", stateMutability: "pure", inputs: [{ name: "tier", type: "uint8" }], outputs: [{ name: "price", type: "uint256" }, { name: "duration", type: "uint256" }, { name: "name", type: "string" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }, { name: "id", type: "uint256" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "usdt", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "totalRevenue", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "TIER_BASIC", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8" }] },
  { type: "function", name: "TIER_PRO", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8" }] },
  { type: "function", name: "TIER_ELITE", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8" }] },
  { type: "function", name: "PRICE_BASIC", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "PRICE_PRO", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "PRICE_ELITE", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
] as const;

export const ReputationRegistryABI = [
  { type: "event", name: "ScorerUpdated", inputs: [{ name: "scorer", type: "address", indexed: true }] },
  { type: "event", name: "ReputationUpdated", inputs: [{ name: "agent", type: "address", indexed: true }, { name: "reputationScore", type: "uint256", indexed: false }, { name: "totalSignals", type: "uint256", indexed: false }] },
  { type: "function", name: "setScorer", stateMutability: "nonpayable", inputs: [{ name: "newScorer", type: "address" }], outputs: [] },
  { type: "function", name: "recordSettlement", stateMutability: "nonpayable", inputs: [{ name: "agent", type: "address" }, { name: "accurate", type: "bool" }, { name: "pnlBps", type: "int256" }, { name: "signalId", type: "uint256" }], outputs: [] },
  { type: "function", name: "getReputation", stateMutability: "view", inputs: [{ name: "agent", type: "address" }], outputs: [{ name: "", type: "tuple", components: [{ name: "totalSignals", type: "uint256" }, { name: "settledSignals", type: "uint256" }, { name: "accurateSignals", type: "uint256" }, { name: "cumulativePnlBps", type: "int256" }, { name: "reputationScore", type: "uint256" }] }] },
  { type: "function", name: "getScore", stateMutability: "view", inputs: [{ name: "agent", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "signalRecorded", stateMutability: "view", inputs: [{ name: "signalId", type: "uint256" }], outputs: [{ name: "", type: "bool" }] },
  { type: "function", name: "scorer", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
] as const;

export const MinimalERC20ABI = [
  {
    "constant": true,
    "inputs": [
      { "name": "_owner", "type": "address" },
      { "name": "_spender", "type": "address" }
    ],
    "name": "allowance",
    "outputs": [{ "name": "", "type": "uint256" }],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [
      { "name": "_spender", "type": "address" },
      { "name": "_value", "type": "uint256" }
    ],
    "name": "approve",
    "outputs": [{ "name": "", "type": "bool" }],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;
