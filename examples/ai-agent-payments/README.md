# Example 5 — Autonomous AI Agent Payment Flow (HTTP 402 / x402)

Demonstrates how an autonomous AI agent handles an `HTTP 402 Payment Required` response from a metered API endpoint, parses the payment challenge, creates a bound Solana USDC invoice via `@moltalpha/sdk`, verifies on-chain settlement, and retries the original request with the issued API key.

## Running the Agent Flow

```bash
node examples/ai-agent-payments/agent-checkout.mjs --demo
```
