# Kite Signal Platform

Kite Signal Platform is a TypeScript monorepo for AI-generated trading signals on Kite Testnet. It combines Solidity commit/reveal attestations, an Express API, a PostgreSQL/Drizzle data model, a scorer keeper, and shared TypeScript packages for contract ABIs and API schemas.

## Repository structure

- `contracts/` — Hardhat project with `SignalRegistry`, `SubscriptionPass`, `ClientAgentVault`, and `ReputationRegistry`.
- `artifacts/api-server/` — Express API for agents, signals, subscribers, stats, WebSocket broadcasts, and reputation reads.
- `artifacts/scorer/` — Autonomous scorer/keeper that reveals signals when possible, expires unrevealed signals, settles revealed expired signals, and writes reputation on-chain.
- `lib/contracts/` — Shared ABIs and `DEPLOYMENTS` object loaded from `kite-testnet.json` with environment overrides.
- `lib/db/` — Drizzle schema and database client.
- `lib/api-zod/` — Shared Zod request/response schemas.
- `scripts/` — Utility scripts, including demo data seeding.

## Required environment variables

### API server

- `DATABASE_URL` — PostgreSQL connection string.
- `SIGNAL_REGISTRY_ADDRESS` — Optional override for `DEPLOYMENTS.signalRegistry`.
- `SUBSCRIPTION_PASS_ADDRESS` — Optional override for `DEPLOYMENTS.subscriptionPass`.
- `REPUTATION_REGISTRY_ADDRESS` — Optional override for `DEPLOYMENTS.reputationRegistry`.
- `LOG_LEVEL` — Optional pino log level.

### Scorer

- `DATABASE_URL` — Same database used by the API.
- `API_BASE_URL` — Base URL for the API, for example `http://localhost:3000`.
- `ANTHROPIC_API_KEY` — Claude API key used for AI scoring.
- `SCORER_PRIVATE_KEY` — Funded scorer wallet private key for `ReputationRegistry.recordSettlement`.
- `REPUTATION_REGISTRY_ADDRESS` — Reputation registry address. The scorer fails fast if absent.
- `COINGECKO_API_KEY` — Optional CoinGecko demo/pro API key.
- `AGENT_PRIVATE_KEYS` — Optional JSON object mapping agent wallet addresses to private keys for reveal automation, for example `{ "0xabc...": "0x123..." }`.
- `LOG_LEVEL` — Optional pino log level.

### Contract deployment

- `DEPLOYER_PRIVATE_KEY` — Kite Testnet deployer private key.
- `SCORER_ADDRESS` — Optional initial scorer address for `ReputationRegistry`; defaults to deployer.

## Install and build

```bash
pnpm install
pnpm run typecheck
```

## Deploy contracts to Kite Testnet

```bash
cd contracts
DEPLOYER_PRIVATE_KEY=0x... SCORER_ADDRESS=0x... pnpm run deploy:testnet
```

The deploy script writes deployment metadata to:

- `contracts/deployments/kite-testnet.json`
- `lib/contracts/src/kite-testnet.json`

If a block explorer for Kite Testnet is available, verify the deployed source for all contracts, especially `ReputationRegistry`, using the explorer's verification workflow and the constructor arguments printed by the deploy script.

## Run the API

```bash
DATABASE_URL=postgres://... pnpm --filter @workspace/api-server run dev
```

The API mounts routes under `/api`, including:

- `POST /api/agents`
- `POST /api/signals`
- `POST /api/signals/:id/settle`
- `POST /api/signals/:id/expire`
- `GET /api/agents/:id/reputation`
- `POST /api/subscribers`
- `POST /api/subscribers/verify`
- `GET /api/stats`

WebSocket clients connect to `/ws` with `x-kite-session-token`.

## Run the scorer

```bash
DATABASE_URL=postgres://... \
API_BASE_URL=http://localhost:3000 \
ANTHROPIC_API_KEY=... \
SCORER_PRIVATE_KEY=0x... \
REPUTATION_REGISTRY_ADDRESS=0x... \
pnpm --filter @workspace/scorer run start
```

On boot, the scorer validates required env vars, checks Kite RPC chain ID, and verifies the scorer wallet has gas. Each loop:

1. Reveals pending unrevealed signals before expiration when an agent private key is available.
2. Finds expired pending signals.
3. Expires signals that have an on-chain ID but were not revealed before the deadline.
4. Fetches CoinGecko prices for revealed/eligible expired signals.
5. Scores with Claude and falls back to deterministic rule-based scoring if Claude fails.
6. Calls the settlement API with exponential backoff.
7. Best-effort writes reputation on-chain.

## Seed demo data

```bash
DATABASE_URL=postgres://... pnpm --filter @workspace/scripts run demo:seed
```

This creates demo agents and a batch of pending signals, including some already expired so the scorer has work to process during a live demo.

## End-to-end demo loop

1. Deploy contracts and fund the scorer wallet with Kite Testnet gas.
2. Start PostgreSQL and set `DATABASE_URL` for all processes.
3. Start the API server.
4. Run `pnpm --filter @workspace/scripts run demo:seed`.
5. Start the scorer.
6. Watch API logs, scorer logs, and WebSocket `reputation_update` messages.
7. Query `GET /api/agents/:id/reputation` to compare off-chain stats with on-chain reputation.

## Testing

```bash
pnpm run typecheck
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/scorer run build
pnpm --dir contracts run test
```

In restricted environments, Hardhat may fail while downloading the Solidity compiler list. Run contract tests in an environment that can reach the Solidity compiler distribution endpoint or preinstall/cache the compiler.
