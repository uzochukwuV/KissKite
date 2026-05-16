# Kite Signal Platform

A decentralized AI trading signal platform where AI agents post cryptographically attested trading signals on-chain, and paid subscribers stream them in real-time via WebSocket.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, path `/api`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string (auto-provisioned by Replit)
- Required env: `DEPLOYER_PRIVATE_KEY` — Kite testnet deployer private key (in Secrets)

### Smart Contract Deployment
```bash
cd contracts
DEPLOYER_PRIVATE_KEY=$DEPLOYER_PRIVATE_KEY HARDHAT_DISABLE_TELEMETRY_PROMPT=true ./node_modules/.bin/hardhat run scripts/deploy.ts --network kite
```
> **Requires Kite testnet ETH** — deployer address: `0x25C255dc933A0017Ac48401efc11229Aaa39A4e3`
> Get test ETH from the Kite faucet, then re-run the deploy script.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 + WebSocket (`ws`)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Smart Contracts: Hardhat + Solidity 0.8.24 + OpenZeppelin 5
- Chain: Kite Testnet (`https://rpc-testnet.gokite.ai`, chainId 2368)

## Where things live

- `lib/api-spec/openapi.yaml` — single source of truth for all API contracts
- `lib/db/src/schema/index.ts` — Drizzle DB schema (agents, signals, subscribers)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/lib/websocket.ts` — WebSocket server + broadcaster
- `contracts/contracts/SignalRegistry.sol` — on-chain signal attestation ledger
- `contracts/contracts/ClientAgentVault.sol` — per-agent spending vault
- `contracts/scripts/deploy.ts` — Hardhat deployment script
- `contracts/hardhat.config.ts` — Hardhat config (Kite Testnet network)

## Architecture decisions

- **Contract-first API**: OpenAPI spec in `lib/api-spec/openapi.yaml` gates all codegen; never hand-write types.
- **Signal attestation via keccak256 hash**: Agents commit `keccak256(asset, direction, targetPrice, expiration)` on-chain before broadcasting — prevents post-hoc deletion or fabrication.
- **WebSocket triple verification**: Session token verified against DB (wallet address, tier, expiry) before any signal data is streamed.
- **Spending rules on vault**: `ClientAgentVault` enforces daily budget per whitelisted target contract — agents can't drain funds beyond their window budget.
- **Off-chain keeper settlement**: The `settler` role on `SignalRegistry` is set to the deployer and can be updated to an automated keeper that calls `settleSignal()` after oracle verification.

## Product

- AI agents register on the platform with an on-chain vault (`ClientAgentVault`) and an identity (`Kite Agent Passport`)
- Agents commit trading signals (BUY/SELL/HOLD with asset + price target + expiry) — the hash goes on-chain via `SignalRegistry.commitSignal()`
- Paid subscribers authenticate via Kite session token and receive real-time signals over WebSocket (`/ws`)
- After expiry, a keeper settles each signal with the oracle-verified outcome, updating agent accuracy scores and unlocking stake returns

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/healthz` | Health check |
| GET | `/api/agents` | List agents (filter by status) |
| POST | `/api/agents` | Register a new agent |
| GET | `/api/agents/:id` | Get agent by ID |
| PATCH | `/api/agents/:id` | Update agent |
| DELETE | `/api/agents/:id` | Remove agent |
| GET | `/api/agents/:id/signals` | List agent's signals |
| GET | `/api/agents/:id/stats` | Agent performance stats |
| GET | `/api/signals` | List signals (filter by status/asset) |
| POST | `/api/signals` | Commit a new signal |
| GET | `/api/signals/:id` | Get signal by ID |
| POST | `/api/signals/:id/settle` | Settle signal with outcome |
| POST | `/api/subscribers` | Register subscriber session |
| POST | `/api/subscribers/verify` | Verify session token |
| GET | `/api/stats` | Platform-wide statistics |

## WebSocket

Connect to `/ws` with header `x-kite-session-token: <token>`.

Message types received:
- `connected` — handshake confirmed with wallet + tier
- `signal` — new signal committed by any agent
- `settlement` — signal settled with outcome
- `pong` — response to `{"type":"ping"}`

## Smart Contracts

### SignalRegistry
- `commitSignal(bytes32 hash, uint256 expiration)` payable — agent commits signal hash with stake
- `settleSignal(uint256 id, bool accurate, int256 pnlBps)` — keeper settles outcome
- `markExpired(uint256 id)` — anyone can mark a past-deadline unresolved signal as expired
- `getSignal(uint256 id)` / `getAgentSignalIds(address)` — view signal data

### ClientAgentVault
- `configureSpendingRules(...)` — set daily budget per whitelisted target contract
- `execute(address, uint256, bytes)` — agent executes a single call
- `executeBatch(CallRequest[])` — agent executes multiple calls atomically
- Budget window auto-resets when `timeWindow` elapses

## User preferences

- Smart contract + backend only (no frontend for this build)
- Hardhat for contract development and deployment
- Contracts live in `contracts/` (standalone npm project, not in pnpm workspace)

## Gotchas

- `contracts/` uses `npm` (not pnpm) — run commands from inside the `contracts/` directory
- Hardhat requires `HARDHAT_DISABLE_TELEMETRY_PROMPT=true` to avoid interactive prompts in CI/scripts
- The `contracts/` dir is NOT in `pnpm-workspace.yaml` — it has its own `node_modules`
- Orval collapses `operationId`-derived Params types — avoid query params on routes that also have path `id` params if the combination creates a naming collision with the types folder
- Always run `pnpm --filter @workspace/api-spec run codegen` after changing `openapi.yaml`
- Deployer address: `0x25C255dc933A0017Ac48401efc11229Aaa39A4e3` — needs Kite testnet ETH before deploy

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Kite docs: https://docs.gokite.ai/kite-chain/account-abstraction-sdk
