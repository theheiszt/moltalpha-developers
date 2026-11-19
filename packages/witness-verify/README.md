# `@moltalpha/witness-verify`

Zero-dependency, MIT-licensed **RFC 8785 (JCS) + Ed25519** cryptographic witness verifier for **MoltALPHA** Solana DEX risk telemetry, Metal X market observations, and autonomous AI agent execution receipts.

- **Zero runtime dependencies** — uses Node.js built-in `node:crypto` Ed25519 SPKI verification (`Node >= 20`).
- **Offline verification** — verify receipts in `<2ms` without trusting a centralized dashboard.
- **Rotating key-epoch support** — fetches authoritative SPKI keys directly from `https://api.moltalpha.dev/v1/witnesses/public-keys`.
- **Designed for autonomous agents** — plug cleanly into Solana Agent Kit, Squads v4, Turnkey, Privy, Crossmint, and MCP workflows.

---

## Live Key Registry

Inspect MoltALPHA's live rotating Ed25519 witness keys right now:

```bash
curl -s https://api.moltalpha.dev/v1/witnesses/public-keys | jq .
```

## Quickstart (TypeScript / Node.js)

### 1. Offline Verification (Zero Network Calls)

```ts
import { verifyWitnessSignature } from '@moltalpha/witness-verify';

const result = verifyWitnessSignature({
  payload: {
    schema: 'moltalpha.witness.receipt.v1',
    pool: 'Raydium_SOL_USDC',
    risk_score: 2.1,
    slot: 312900001,
  },
  signature: '<ed25519-hex-or-base64-signature>',
  publicKeySpkiHex:
    '302a300506032b65700321003f35fa618e74882d850f2859143ede624983bf0cf9d00672135cb9cbf01e2225',
});

if (!result.valid) {
  throw new Error(`Witness verification failed: ${result.code} — ${result.message}`);
}
```

### 2. Verify Against the Live Authoritative Registry

```ts
import { verifyWithLiveRegistry } from '@moltalpha/witness-verify';

const check = await verifyWithLiveRegistry({
  payload: receipt.payload,
  signature: receipt.signature,
  keyId: receipt.signing_key_id, // e.g. "wit_key_a8a5281fbf00"
  gatewayUrl: 'https://api.moltalpha.dev',
});

console.log(check.valid, check.payloadSha256, check.keyStatus);
```

### 3. CLI Usage

```bash
# Inspect live authoritative Ed25519 witness public keys
npx tsx packages/witness-verify/src/cli.ts keys

# Verify a signed JSON receipt file
npx tsx packages/witness-verify/src/cli.ts verify ./receipt.json
```

## License

MIT — Copyright (c) 2026 MoltALPHA (`https://www.moltalpha.dev`).
