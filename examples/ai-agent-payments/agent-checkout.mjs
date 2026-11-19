/**
 * Example 5 — Autonomous AI Agent Payment Flow (HTTP 402 / x402)
 */

import { CANONICAL_SOLANA_TREASURY, MoltAlpha } from '../../sdk/javascript/index.mjs';

const DEMO_TX_SIG =
  '5UfDuX7WXY8Qp9LkM2nN4pQrStUvWxYz123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwx';

export async function runAgentPaymentDemo() {
  let activeApiKey = null;

  const mockFetch = async (url, init = {}) => {
    const urlStr = String(url);
    const headers = init.headers || {};
    const authHeader = headers['X-API-KEY'] || headers['X-API-Key'] || headers['x-api-key'] || '';

    if (urlStr.endsWith('/v1/sentinel/feed')) {
      if (!authHeader) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'PAYMENT_REQUIRED',
              message: 'Valid API key with positive credit balance required.',
              payment_config_endpoint: 'GET /v1/payments/config',
              create_invoice_endpoint: 'POST /v1/payments/invoice',
              recommended_tier: 'tier_starter',
              accepted_assets: ['USDC', 'SOL', 'XNO'],
            },
          }),
          { status: 402, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({
          ok: true,
          feed: [{ pool: 'SOL/USDC', risk_score: 1.4, status: 'SAFE' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (urlStr.endsWith('/v1/payments/invoice')) {
      return new Response(
        JSON.stringify({
          success: true,
          invoice_id: 'inv_agent_x402_001',
          reference: '4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi',
          target_tier: 'tier_starter',
          credits: 50,
          asset: 'USDC',
          amount_raw: 1000000,
          amount_formatted: '1.00 USDC',
          treasury_wallet: CANONICAL_SOLANA_TREASURY,
          cluster: 'mainnet-beta',
          claim_secret: 'sec_agent_x402_secret_1234567890',
          expires_at: '2026-11-19T22:00:00Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (urlStr.endsWith('/v1/payments/verify-solana')) {
      return new Response(
        JSON.stringify({
          success: true,
          status: 'newly_minted',
          api_key: 'mk_demo_agent_settled_key',
          key_prefix: 'mk_demo_agen',
          credits: 50,
          tier: 'tier_starter',
          invoice_id: 'inv_agent_x402_001',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    throw new Error(`Unhandled agent demo route: ${urlStr}`);
  };

  console.log('[1/3] Agent received HTTP 402 challenge; creating Solana USDC payment request...');
  const client = new MoltAlpha({ fetch: mockFetch });
  const invoice = await client.payments.create({
    tier: 'tier_starter',
    currency: 'USDC',
    network: 'solana',
  });

  console.log(`[2/3] Verifying agent settlement on-chain for invoice ${invoice.invoice_id}...`);
  const verified = await client.payments.verifySolana({
    invoice_id: invoice.invoice_id,
    transaction_signature: DEMO_TX_SIG,
    claim_secret: invoice.claim_secret,
  });
  activeApiKey = verified.api_key;

  const authedClient = new MoltAlpha({ apiKey: activeApiKey, fetch: mockFetch });
  const feed = await authedClient.sentinel.getFeed();
  console.log(`[3/3] Authenticated retry succeeded: received ${feed.feed.length} verified feed entry.`);
  console.log('AGENT_PAYMENTS_OK');
  return { invoice, verified, feed };
}

const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());

if (isMain) {
  runAgentPaymentDemo().catch((err) => {
    console.error('Agent checkout failed:', err.message);
    process.exitCode = 1;
  });
}
