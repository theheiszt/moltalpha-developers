/**
 * Example 1 — Node.js Solana Payment Checkout
 * Demonstrates non-custodial payment request creation, Solana Pay URI construction,
 * server-side on-chain settlement verification, and invoice status checking.
 */

import {
  CANONICAL_SOLANA_TREASURY,
  CANONICAL_USDC_MINT,
  MoltAlpha,
  buildSolanaPayUrl,
  decimalToRawUnits,
  validateMerchantWallet,
} from '../../sdk/javascript/index.mjs';

const DEMO_REFERENCE = '4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi';
const DEMO_TX_SIG =
  '5UfDuX7WXY8Qp9LkM2nN4pQrStUvWxYz123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwx';

function createDemoFetch() {
  return async (url, init = {}) => {
    const urlStr = String(url);
    const method = String(init.method || 'GET').toUpperCase();

    if (method === 'POST' && urlStr.endsWith('/v1/payments/invoice')) {
      const reqBody = JSON.parse(String(init.body || '{}'));
      const asset = reqBody.asset || 'USDC';
      const amountRaw = asset === 'USDC' ? 1000000 : 13600000;
      const solanaPayUrl = buildSolanaPayUrl({
        recipient: CANONICAL_SOLANA_TREASURY,
        amount: asset === 'USDC' ? '1.00' : '0.0136',
        asset,
        reference: DEMO_REFERENCE,
        label: 'MoltAlpha',
      });
      return new Response(
        JSON.stringify({
          success: true,
          invoice_id: 'inv_demo_solana_001',
          reference: DEMO_REFERENCE,
          target_tier: reqBody.target_tier || 'tier_starter',
          credits: 50,
          asset,
          amount_raw: amountRaw,
          amount_formatted: asset === 'USDC' ? '1.00 USDC' : '0.0136 SOL',
          treasury_wallet: CANONICAL_SOLANA_TREASURY,
          cluster: reqBody.cluster || 'mainnet-beta',
          solana_pay_url: solanaPayUrl,
          claim_secret: 'sec_demo_checkout_secret_9876543210',
          created_at: '2026-11-19T21:00:00Z',
          expires_at: '2026-11-19T21:30:00Z',
          instructions: `Send 1.00 ${asset} to ${CANONICAL_SOLANA_TREASURY} with reference ${DEMO_REFERENCE}`,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (method === 'POST' && urlStr.endsWith('/v1/payments/verify-solana')) {
      const reqBody = JSON.parse(String(init.body || '{}'));
      return new Response(
        JSON.stringify({
          success: true,
          status: 'newly_minted',
          message: 'Payment verified on-chain and invoice fulfilled.',
          key_prefix: 'mk_demo_7f2a',
          credits: 50,
          tier: 'tier_starter',
          invoice_id: reqBody.invoice_id || 'inv_demo_solana_001',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (method === 'GET' && urlStr.includes('/v1/payments/invoice/')) {
      return new Response(
        JSON.stringify({
          success: true,
          invoice_id: 'inv_demo_solana_001',
          reference: DEMO_REFERENCE,
          status: 'fulfilled',
          rail: 'solana',
          tier: 'tier_starter',
          credits: 50,
          asset: 'USDC',
          amount_raw: 1000000,
          recipient: CANONICAL_SOLANA_TREASURY,
          cluster: 'mainnet-beta',
          tx_signature: DEMO_TX_SIG,
          created_at: '2026-11-19T21:00:00Z',
          expires_at: '2026-11-19T21:30:00Z',
          fulfilled_at: '2026-11-19T21:01:05Z',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    throw new Error(`Unhandled demo route: ${method} ${urlStr}`);
  };
}

export async function runCheckoutFlow(options = {}) {
  const isLive = Boolean(options.live);
  const tier = options.tier || 'tier_starter';
  const currency = options.currency || 'USDC';
  const merchantWallet =
    options.merchantWallet || process.env.MOLTALPHA_MERCHANT_WALLET || CANONICAL_SOLANA_TREASURY;

  // Step 1: Validate merchant wallet (ensuring it is not the SPL USDC mint contract)
  const walletCheck = validateMerchantWallet(merchantWallet, 'solana');
  if (!walletCheck.valid) {
    throw new Error(`Merchant wallet validation failed (${walletCheck.code}): ${walletCheck.reason}`);
  }
  const mintCheck = validateMerchantWallet(CANONICAL_USDC_MINT, 'solana');
  if (mintCheck.valid) {
    throw new Error('Safety invariant violated: SPL USDC Mint contract must never pass wallet validation');
  }
  console.log(`[1/4] Merchant wallet verified: ${walletCheck.address} (${walletCheck.rail})`);

  // Step 2: Exact integer unit check (BigInt, zero floating-point math)
  const sampleRaw = decimalToRawUnits('1.00', currency);
  console.log(`[2/4] Exact unit check: 1.00 ${currency} = ${sampleRaw.toString(10)} raw micro-units`);

  // Step 3: Initialize client and create payment invoice
  const client = new MoltAlpha({
    baseUrl: process.env.MOLTALPHA_BASE_URL || 'https://api.moltalpha.dev',
    merchantWallet,
    network: 'solana',
    ...(isLive ? {} : { fetch: createDemoFetch() }),
  });

  const invoice = await client.payments.create({
    tier,
    currency,
    network: 'solana',
    cluster: process.env.MOLTALPHA_CLUSTER || 'mainnet-beta',
    idempotencyKey: `checkout_${tier}_${currency}_001`,
  });

  console.log(
    `[3/4] Payment invoice created: ${invoice.invoice_id} | ${invoice.amount_formatted} -> ${invoice.treasury_wallet}`
  );
  console.log(`      Solana Pay URI: ${invoice.solana_pay_url}`);

  if (isLive) {
    const status = await client.payments.getStatus(invoice.invoice_id);
    console.log(`[4/4] Live invoice status: ${status.status} (expires ${status.expires_at})`);
    return { invoice, status };
  }

  // Step 4: Verify on-chain settlement in deterministic sandbox mode
  const verification = await client.payments.verifySolana({
    invoice_id: invoice.invoice_id,
    transaction_signature: DEMO_TX_SIG,
    claim_secret: invoice.claim_secret,
  });
  const finalStatus = await client.payments.getStatus(invoice.invoice_id);

  console.log(
    `[4/4] Settlement verified: status=${verification.status} | tier=${verification.tier} | credits=${verification.credits} | invoice_status=${finalStatus.status}`
  );
  console.log('NODE_CHECKOUT_OK');
  return { invoice, verification, finalStatus };
}

const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());

if (isMain) {
  const args = process.argv.slice(2);
  const live = args.includes('--live');
  const tierArg = args.find((a) => a.startsWith('--tier='))?.split('=')[1];
  const currencyArg = args.find((a) => a.startsWith('--currency='))?.split('=')[1];
  runCheckoutFlow({ live, tier: tierArg, currency: currencyArg }).catch((err) => {
    console.error('Checkout error:', err.message);
    process.exitCode = 1;
  });
}
