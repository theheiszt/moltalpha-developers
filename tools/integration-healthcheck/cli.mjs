/**
 * MoltAlpha Integration Healthcheck CLI
 * Validates local SDK configuration, merchant wallet addresses, exact monetary precision,
 * webhook signature verification, and optional live API connectivity.
 */

import {
  CANONICAL_SOLANA_TREASURY,
  CANONICAL_USDC_MINT,
  MoltAlpha,
} from '../../sdk/javascript/index.mjs';
import { runPaymentVerifierCli } from '../payment-verifier/cli.mjs';
import { runWebhookTesterCli } from '../webhook-tester/cli.mjs';

export async function runIntegrationHealthcheck(args = process.argv.slice(2)) {
  const isLive = args.includes('--live');
  const merchantWallet =
    args.find((a) => a.startsWith('--wallet='))?.split('=')[1] ||
    process.env.MOLTALPHA_MERCHANT_WALLET ||
    CANONICAL_SOLANA_TREASURY;

  const client = new MoltAlpha({
    baseUrl: process.env.MOLTALPHA_BASE_URL || 'https://api.moltalpha.dev',
    merchantWallet,
    network: 'solana',
  });

  // 1. Verify merchant wallet & anti-mint guard
  const walletCheck = client.payments.validateMerchantWallet(merchantWallet, 'solana');
  if (!walletCheck.valid) {
    throw new Error(`Configured merchant wallet is invalid: ${walletCheck.reason}`);
  }
  const mintCheck = client.payments.validateMerchantWallet(CANONICAL_USDC_MINT, 'solana');
  if (mintCheck.valid) {
    throw new Error('Anti-mint safety check failed');
  }

  // 2. Run payment verifier & webhook tester self-tests
  await runPaymentVerifierCli(['--self-test']);
  await runWebhookTesterCli(['--self-test']);

  if (isLive) {
    const cfg = await client.payments.getConfig();
    if (!cfg || cfg.solana_treasury_wallet !== CANONICAL_SOLANA_TREASURY) {
      throw new Error('Live /v1/payments/config treasury mismatch');
    }
    const keys = await client.witness.fetchPublicKeys();
    if (!keys || !keys.active_key_id) {
      throw new Error('Live /v1/witnesses/public-keys active_key_id missing');
    }
    console.log(
      `[PASS] Live API gateway verified: treasury=${cfg.solana_treasury_wallet} | active_witness_key=${keys.active_key_id}`
    );
  }

  console.log('INTEGRATION_HEALTHCHECK_OK');
  return { ok: true, merchantWallet, liveChecked: isLive };
}

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  runIntegrationHealthcheck().catch((err) => {
    console.error('Integration healthcheck failed:', err.message);
    process.exitCode = 1;
  });
}
