# `@moltalpha/solana-agent-kit-plugin`

MIT-licensed **Solana Agent Kit** plugin giving autonomous Solana AI agents direct access to **MoltALPHA** DEX risk telemetry and offline **RFC 8785 + Ed25519** cryptographic witness verification.

## Included Agent Actions
- `MOLTALPHA_GET_WITNESS_KEYS` — Fetches authoritative rotating Ed25519 SPKI witness keys (`GET https://api.moltalpha.dev/v1/witnesses/public-keys`).
- `MOLTALPHA_VERIFY_WITNESS` — Verifies RFC 8785 canonical JSON receipts offline before executing swaps.
- `MOLTALPHA_GET_FIRST_PASSAGE_RISK` — Queries Solana DEX spread-adjusted first-passage trade viability probabilities (`GET https://api.moltalpha.dev/v1/quant/first-passage`).
- `MOLTALPHA_GET_DATA_PRODUCTS` — Lists live verifiable Solana intelligence feeds (`GET https://api.moltalpha.dev/v1/data-products`).

## Usage

```ts
import { createMoltAlphaAgentKitPlugin } from '@moltalpha/solana-agent-kit-plugin';

const moltalpha = createMoltAlphaAgentKitPlugin({
  gatewayUrl: 'https://api.moltalpha.dev',
  apiKey: process.env.MOLTALPHA_API_KEY, // optional for unmetered discovery/risk endpoints
});

const viability = await moltalpha.methods.getFirstPassageProbability({
  pair: 'BONK/SOL',
  targetNetPct: 0.015,
});
```

## License

MIT — Copyright (c) 2026 MoltALPHA (`https://www.moltalpha.dev`).
