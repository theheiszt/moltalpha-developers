/**
 * MoltAlpha Payment Verifier CLI
 * Validates merchant wallets, exact BigInt decimal conversions, Solana Pay URIs,
 * and invoice or transaction settlement status.
 */

import {
  CANONICAL_NANO_TREASURY,
  CANONICAL_SOLANA_TREASURY,
  CANONICAL_USDC_MINT,
  MoltAlpha,
  buildSolanaPayUrl,
  decimalToRawUnits,
  rawUnitsToDecimal,
  validateMerchantWallet,
} from '../../sdk/javascript/index.mjs';

export async function runPaymentVerifierCli(args = process.argv.slice(2)) {
  if (args.includes('--self-test') || args.length === 0) {
    const solOk = validateMerchantWallet(CANONICAL_SOLANA_TREASURY, 'solana');
    const nanoOk = validateMerchantWallet(CANONICAL_NANO_TREASURY, 'nano');
    const mintRej = validateMerchantWallet(CANONICAL_USDC_MINT, 'solana');
    if (!solOk.valid || !nanoOk.valid || mintRej.valid || mintRej.code !== 'MINT_ADDRESS_NOT_WALLET') {
      throw new Error('Wallet validation self-test failed');
    }

    const usdcRaw = decimalToRawUnits('10.00', 'USDC');
    const solRaw = decimalToRawUnits('0.0136', 'SOL');
    const xnoRaw = decimalToRawUnits('2.5', 'XNO');
    if (
      usdcRaw !== 10000000n ||
      solRaw !== 13600000n ||
      xnoRaw !== 2500000000000000000000000000000n ||
      rawUnitsToDecimal(usdcRaw, 'USDC') !== '10'
    ) {
      throw new Error('Exact BigInt unit conversion self-test failed');
    }

    const uri = buildSolanaPayUrl({
      recipient: CANONICAL_SOLANA_TREASURY,
      amount: '10.00',
      asset: 'USDC',
      reference: '4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi',
      label: 'MoltAlpha',
    });
    if (!uri.startsWith(`solana:${CANONICAL_SOLANA_TREASURY}?amount=10&spl-token=${CANONICAL_USDC_MINT}`)) {
      throw new Error(`Unexpected Solana Pay URI: ${uri}`);
    }

    console.log('[PASS] Merchant wallet validation (Solana, Nano, anti-Mint guard)');
    console.log('[PASS] Exact BigInt monetary conversion (USDC 10^6, SOL 10^9, XNO 10^30)');
    console.log(`[PASS] Solana Pay URI construction: ${uri}`);
    console.log('PAYMENT_VERIFIER_OK');
    return { ok: true, uri };
  }

  const walletArg = args.find((a) => a.startsWith('--wallet='))?.split('=')[1];
  const railArg = args.find((a) => a.startsWith('--rail='))?.split('=')[1] || 'solana';
  if (walletArg) {
    const res = validateMerchantWallet(walletArg, railArg);
    console.log(JSON.stringify(res, null, 2));
    if (!res.valid) process.exitCode = 1;
    return res;
  }

  const amountArg = args.find((a) => a.startsWith('--amount='))?.split('=')[1];
  const assetArg = (args.find((a) => a.startsWith('--asset='))?.split('=')[1] || 'USDC').toUpperCase();
  if (amountArg) {
    const raw = decimalToRawUnits(amountArg, assetArg);
    const out = {
      input: amountArg,
      asset: assetArg,
      amount_raw: raw.toString(10),
      normalized_decimal: rawUnitsToDecimal(raw, assetArg),
      ...(assetArg === 'USDC' || assetArg === 'SOL'
        ? {
            solana_pay_url: buildSolanaPayUrl({
              recipient: CANONICAL_SOLANA_TREASURY,
              amount: amountArg,
              asset: assetArg,
            }),
          }
        : {}),
    };
    console.log(JSON.stringify(out, null, 2));
    return out;
  }

  const invoiceArg = args.find((a) => a.startsWith('--invoice='))?.split('=')[1];
  if (invoiceArg) {
    const client = new MoltAlpha();
    const status = await client.payments.getStatus(invoiceArg);
    console.log(JSON.stringify(status, null, 2));
    return status;
  }

  const txArg = args.find((a) => a.startsWith('--tx='))?.split('=')[1];
  if (txArg) {
    const client = new MoltAlpha();
    const status = await client.payments.getTransactionStatus(txArg);
    console.log(JSON.stringify(status, null, 2));
    return status;
  }

  throw new Error('Unknown arguments. Run with --self-test, --wallet=..., --amount=..., --invoice=..., or --tx=...');
}

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  runPaymentVerifierCli().catch((err) => {
    console.error('Payment verifier error:', err.message);
    process.exitCode = 1;
  });
}
