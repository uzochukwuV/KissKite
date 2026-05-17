# Kite Signal Platform

A decentralized AI trading signal platform where AI agents commit cryptographically attested price predictions on-chain before market moves. Paid subscribers stream these signals in real time via WebSocket, and an autonomous scorer settles outcomes using Qwen3 AI and records agent reputation on-chain.

---

## Repository Structure

```
kite-signal-platform/
├── artifacts/
│   ├── api-server/          # Express REST + WebSocket API
│   │   ├── src/
│   │   │   ├── app.ts
│   │   │   ├── index.ts
│   │   │   ├── lib/
│   │   │   │   ├── kite.ts       # Ethers contract clients
│   │   │   │   ├── logger.ts
│   │   │   │   └── websocket.ts  # WS server + broadcast helpers
│   │   │   └── routes/           # agents, signals, stats, subscribers
│   │   └── test/                 # Vitest API tests (Layer 2)
│   └── scorer/              # Autonomous keeper service
│       ├── src/index.ts     # Poll → score → settle → on-chain
│       └── test/            # Vitest scorer tests (Layer 3)
├── contracts/
│   ├── contracts/
│   │   ├── SignalRegistry.sol     # Commit-reveal ledger
│   │   ├── ReputationRegistry.sol # On-chain accuracy scores
│   │   ├── SubscriptionPass.sol   # Soulbound ERC-1155 passes
│   │   ├── ClientAgentVault.sol   # Per-agent spending vault
│   │   └── MockERC20.sol          # Test-only mock USDT
│   ├── scripts/deploy.ts
│   ├── test/                      # Hardhat contract tests (Layer 1)
│   └── hardhat.config.ts
├── lib/
│   ├── api-zod/             # Generated Zod schemas from OpenAPI
│   ├── api-spec/            # openapi.yaml — single source of truth
│   ├── contracts/           # Shared ABIs + deployment addresses
│   └── db/                  # Drizzle ORM schema + pg connection
├── scripts/
│   └── seed-demo.ts         # Demo data seeder
└── test/
    └── e2e/full-flow.test.ts # End-to-end integration tests (Layer 4)
```

---

## Environment Variables

Copy `.env.example` (or set via Replit Secrets):

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `DASHSCOPE_API_KEY` | ✅ | Alibaba Dashscope API key (Qwen3 AI) |
| `SCORER_PRIVATE_KEY` | ✅ | Private key of scorer wallet (writes on-chain) |
| `DEPLOYER_PRIVATE_KEY` | ✅ | Private key for contract deployment |
| `API_BASE_URL` | ✅ (scorer) | Base URL for the API server, e.g. `http://localhost:3000` |
| `REPUTATION_REGISTRY_ADDRESS` | optional | Overrides deployed address from `lib/contracts` |
| `SIGNAL_REGISTRY_ADDRESS` | optional | Overrides deployed address from `lib/contracts` |
| `SUBSCRIPTION_PASS_ADDRESS` | optional | Overrides deployed address from `lib/contracts` |
| `COINGECKO_API_KEY` | optional | CoinGecko API key for price data |
| `LOG_LEVEL` | optional | Pino log level (default: `info`) |

---

## Deploy Steps

### 1. Install dependencies

```bash
pnpm install
```

### 2. Deploy smart contracts to Kite Testnet

```bash
cd contracts
DEPLOYER_PRIVATE_KEY=0x... pnpm run deploy:testnet
```

Deployment writes addresses to `lib/contracts/src/kite-testnet.json` automatically.

### 3. Set up the database

```bash
# Push Drizzle schema to PostgreSQL
pnpm --filter @workspace/db run db:push
```

### 4. Start the API server

```bash
pnpm --filter @workspace/api-server run dev
```

The server listens on `PORT` (default 3000). WebSocket endpoint: `ws://localhost:3000/ws`.

### 5. Start the scorer

```bash
API_BASE_URL=http://localhost:3000 \
DASHSCOPE_API_KEY=sk-... \
SCORER_PRIVATE_KEY=0x... \
pnpm --filter @workspace/scorer run start
```

The scorer polls every 60 seconds, settles expired signals, and records outcomes on-chain.

---

## How to Trigger the Full Loop End-to-End

```bash
# 1. Seed demo agents and signals (some already expired, ready for scorer)
API_BASE_URL=http://localhost:3000 pnpm tsx scripts/seed-demo.ts

# 2. The scorer will pick up expired signals on its next poll cycle.
#    To trigger immediately, restart the scorer — it polls on startup.

# 3. Watch scorer logs — it will fetch prices from CoinGecko, call Qwen3,
#    post settlements to the API, and record reputation on-chain.

# 4. Check results via the API:
curl http://localhost:3000/api/stats
curl http://localhost:3000/api/agents
curl http://localhost:3000/api/signals?status=settled
```

---

## Running Tests

### Layer 1 — Contract Tests (Hardhat)

```bash
cd contracts
npx hardhat test
```

Tests all four contracts: `ReputationRegistry`, `SignalRegistry`, `SubscriptionPass`, `ClientAgentVault`.

### Layer 2 — API Tests (Vitest + Supertest)

```bash
pnpm --filter @workspace/api-server run test
```

Tests all REST endpoints with a real PostgreSQL test database.

### Layer 3 — Scorer Tests (Vitest)

```bash
pnpm --filter @workspace/scorer run test
```

Tests scoring logic, Dashscope integration (mocked), retry logic, and rule-based fallback.

### Layer 4 — End-to-End Tests (Vitest)

```bash
pnpm --filter ./test run test
# or from root:
pnpm exec vitest run --config test/vitest.config.ts
```

Tests the full agent registration → signal commit → settlement → WebSocket flow.

### Run all tests from root

```bash
pnpm run test
```

---

## AI Scoring (Dashscope Qwen3)

The scorer uses **Qwen3** via Alibaba's Dashscope API (`qwen3-6b-flash` model) to evaluate signal accuracy. The endpoint used:

```
POST https://dashscope-intl.aliyuncs.com/api/v2/apps/protocols/compatible-mode/v1/responses
```

With `enable_thinking: false` for deterministic JSON output. Falls back to rule-based scoring automatically if the API is unavailable or returns unexpected output.

---

## Network

**Kite Testnet**
- Chain ID: `2368`
- RPC: `https://rpc-testnet.gokite.ai`
- Explorer: `https://testnet.kitescan.io`

---

## Architecture Overview

```
Agents (AI wallets)
    │
    ▼
POST /api/signals  ──────────────────────────────┐
    │  (commit hash + metadata)                   │
    ▼                                             │
SignalRegistry.sol  (on-chain commitment)         │
    │                                             │
    ▼  (expiration passes)                        │
Scorer (polls every 60s)                          │
    │                                             │
    ├─ fetchClosingPrice (CoinGecko)              │
    ├─ qwenVerdict (Dashscope Qwen3)              │
    ├─ POST /api/signals/:id/settle  ─────────────┘
    └─ ReputationRegistry.recordSettlement (on-chain)
    
Subscribers (WebSocket /ws)
    ├─ signal events (on commit)
    └─ reputation_update events (on settle)
```
