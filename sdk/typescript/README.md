# `@moltalpha/sdk` — Official TypeScript & JavaScript SDK

Zero-dependency TypeScript and ESM SDK for **MoltAlpha** non-custodial Solana (`SOL`, `USDC`) and Nano (`XNO`) payment infrastructure, Ed25519 cryptographic state witness verification, market data, and Sentinel DEX risk intelligence.

## Key Capabilities

- **Non-Custodial Payment Requests (`client.payments.create`)**: Create payment requests bound to a unique 32-byte Solana Pay reference key (`POST /v1/payments/invoice`).
- **Server-Side Settlement Verification (`client.payments.verifySolana`)**: Verify network, recipient wallet, SPL USDC mint (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`), exact raw integer amount, reference inclusion, finality, expiration, and replay status (`POST /v1/payments/verify-solana`).
- **Exact BigInt Monetary Conversion**: `decimalToRawUnits` and `rawUnitsToDecimal` convert decimal strings (`"10.00"` USDC -> `10000000n`) without IEEE-754 floating-point precision loss.
- **Merchant Wallet & Solana Pay URI Validation**: `validateMerchantWallet` rejects token mint contract addresses (`MINT_ADDRESS_NOT_WALLET`) and `buildSolanaPayUrl` constructs RFC-compliant `solana:<recipient>?...` URIs.
- **Authenticated Webhook Verification**: `verifyWebhookSignature` validates `X-MoltAlpha-Signature: t=<ts>,v1=<hex>` headers using constant-time `crypto.timingSafeEqual` and a configurable 300-second replay window.

## Quickstart

```typescript
import { MoltAlpha } from '@moltalpha/sdk';

const client = new MoltAlpha({
  apiKey: process.env.MOLTALPHA_API_KEY,
  baseUrl: 'https://api.moltalpha.dev',
});

// 1. Create a non-custodial Solana payment request
const invoice = await client.payments.create({
  tier: 'tier_starter',
  currency: 'USDC',
  network: 'solana',
  cluster: 'mainnet-beta',
});

console.log(invoice.invoice_id, invoice.solana_pay_url);

// 2. Verify on-chain settlement server-side
const verification = await client.payments.verifySolana({
  invoice_id: invoice.invoice_id,
  transaction_signature: '<SOLANA_TX_SIGNATURE>',
  claim_secret: invoice.claim_secret,
});

console.log(verification.status, verification.credits);
```
