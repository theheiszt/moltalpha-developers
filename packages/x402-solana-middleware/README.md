# `@moltalpha/x402-solana-middleware`

Drop-in, zero-dependency, MIT-licensed **HTTP 402 (`x402`)** pay-per-call Express/Node middleware settled in **Solana SPL USDC** or **Zero-Fee Nano (XNO)** with built-in replay protection and RPC failover.

Built by **MoltALPHA** (`https://www.moltalpha.dev`) for the Solana agentic economy (`solana.ai` / `x402`).

## Quickstart

```ts
import express from 'express';
import { createX402SolanaMiddleware } from '@moltalpha/x402-solana-middleware';

const app = express();

const requireMicroPayment = createX402SolanaMiddleware({
  resourceDescription: 'Solana DEX Pre-Trade Risk Feed',
  solanaTreasuryAddress: 'BU5zBur46YjnCaY34XGBTJ8KSAG9EExjpZA58wDo7wAx',
  minUsdcMicroUnits: 10_000n, // $0.01 USDC (6 decimals)
  nanoTreasuryAddress: 'nano_1s5ce5k7bj74sp31m3opq8xwx44stc5dgw6w8uajyg61xjg9wiaae4uby6pu',
  minNanoRaw: 10_000_000_000_000_000_000_000_000_000n, // 0.01 XNO (30 decimals)
});

app.get('/v1/pools/risk', requireMicroPayment, (req, res) => {
  res.json({ ok: true, payment: req.x402Payment });
});
```

## Protocol Flow
1. Unpaid request → server returns **`HTTP 402`** with `x402Version: 1`, `X-Payment-Protocol: x402-v1`, and exact `accepts` payment specs for `solana-usdc` and `nano`.
2. Autonomous agent settles on-chain and retries with header:
   - `X-Payment: solana-usdc:<finalized-solana-tx-signature>` or
   - `X-Payment: nano:<confirmed-64-char-nano-send-block-hash>`
3. Middleware verifies finality, mint/recipient, exact base units, freshness window, and replay store (`HTTP 409` on double-spend), then attaches base64 `X-Payment-Response` and invokes `next()`.

## License

MIT — Copyright (c) 2026 MoltALPHA.
