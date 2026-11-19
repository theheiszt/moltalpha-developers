/**
 * MoltALPHA Public Payments & Exact Integer Unit SDK (JavaScript ESM)
 * Client for multi-rail payment discovery, invoice lifecycle, on-chain settlement verification,
 * Solana Pay URI construction, merchant wallet validation, and HMAC-SHA256 webhook verification:
 *   - GET  /v1/payments/config
 *   - POST /v1/payments/invoice
 *   - GET  /v1/payments/invoice/{invoice_id}
 *   - POST /v1/payments/invoice/{invoice_id}/claim
 *   - GET  /v1/payments/status/{signature}
 *   - POST /v1/payments/verify-solana
 *   - POST /v1/payments/verify-nano
 *   - POST /v1/payments/reconcile
 *
 * CRITICAL ARITHMETIC RULE:
 *   Never use JavaScript Number / parseFloat for payment amounts.
 *   Nano raw units (10^30 per XNO) exceed Number.MAX_SAFE_INTEGER (2^53 - 1).
 *   This module uses quoteUnsafeJsonIntegers() and native BigInt arithmetic exclusively.
 */

import crypto from 'node:crypto';
import { DEFAULT_API_GATEWAY_URL, parseJsonPreservingLargeInts, requestJson } from './http.mjs';

export const CANONICAL_SOLANA_TREASURY = 'BU5zBur46YjnCaY34XGBTJ8KSAG9EExjpZA58wDo7wAx';
export const CANONICAL_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const CANONICAL_NANO_TREASURY = 'nano_1s5ce5k7bj74sp31m3opq8xwx44stc5dgw6w8uajyg61xjg9wiaae4uby6pu';

const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const BASE58_SIGNATURE_REGEX = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;
const NANO_ADDRESS_REGEX = /^nano_[13][13-9a-km-uw-z]{59}$/;

export const ASSET_DECIMALS = Object.freeze({
  SOL: 9,
  LAMPORTS: 9,
  USDC: 6,
  XNO: 30,
  NANO: 30,
});

function resolveDecimals(assetOrDecimals) {
  if (typeof assetOrDecimals === 'number' && Number.isInteger(assetOrDecimals) && assetOrDecimals >= 0) {
    return assetOrDecimals;
  }
  const key = String(assetOrDecimals || '').trim().toUpperCase();
  if (Object.prototype.hasOwnProperty.call(ASSET_DECIMALS, key)) {
    return ASSET_DECIMALS[key];
  }
  throw new Error(`Unsupported payment asset "${String(assetOrDecimals)}": expected SOL, USDC, or XNO`);
}

/**
 * Converts a human-readable decimal string (e.g. "1.5" SOL, "1.25" USDC, "50" XNO)
 * into an exact BigInt in smallest raw units without floating-point conversion.
 */
export function decimalToRawUnits(amountInput, assetOrDecimals = 'SOL') {
  const decimals = resolveDecimals(assetOrDecimals);
  if (typeof amountInput === 'number') {
    if (!Number.isFinite(amountInput) || amountInput < 0 || !Number.isInteger(amountInput)) {
      throw new Error(
        'Invalid payment amount: pass fractional amounts as decimal strings (never floating-point Numbers)'
      );
    }
    amountInput = String(amountInput);
  } else if (typeof amountInput === 'bigint') {
    if (amountInput < 0n) {
      throw new Error('Invalid negative payment amount');
    }
    amountInput = amountInput.toString(10);
  } else if (typeof amountInput !== 'string') {
    throw new Error('Invalid payment amount type: expected string or BigInt');
  }

  const trimmed = amountInput.trim();
  if (!/^\d+(?:\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid decimal payment amount "${amountInput}": must be a non-negative decimal string`);
  }

  const [wholePart, fracPart = ''] = trimmed.split('.');
  if (fracPart.length > decimals) {
    throw new Error(
      `Excess decimal precision in "${amountInput}": maximum ${decimals} decimal places allowed for ${String(assetOrDecimals)}`
    );
  }

  const paddedFrac = fracPart.padEnd(decimals, '0');
  const combined = `${wholePart}${paddedFrac}`.replace(/^0+(?=\d)/, '');
  return BigInt(combined || '0');
}

export const toRawUnits = decimalToRawUnits;
export const parseDecimalToRawUnits = decimalToRawUnits;
export const toSmallestUnits = decimalToRawUnits;

/**
 * Converts an exact raw-unit integer (BigInt or decimal digit string) back to a
 * human-readable decimal string without floating-point loss.
 */
export function rawUnitsToDecimal(rawInput, assetOrDecimals = 'SOL') {
  const decimals = resolveDecimals(assetOrDecimals);
  let rawBig;
  if (typeof rawInput === 'bigint') {
    rawBig = rawInput;
  } else if (typeof rawInput === 'string' && /^\d+$/.test(rawInput.trim())) {
    rawBig = BigInt(rawInput.trim());
  } else if (typeof rawInput === 'number' && Number.isSafeInteger(rawInput) && rawInput >= 0) {
    rawBig = BigInt(rawInput);
  } else {
    throw new Error(`Invalid raw units "${String(rawInput)}": expected non-negative BigInt or integer digit string`);
  }

  if (rawBig < 0n) {
    throw new Error('Invalid negative raw unit amount');
  }
  if (decimals === 0) {
    return rawBig.toString(10);
  }

  const str = rawBig.toString(10).padStart(decimals + 1, '0');
  const whole = str.slice(0, str.length - decimals);
  const frac = str.slice(str.length - decimals).replace(/0+$/, '');
  return frac.length > 0 ? `${whole}.${frac}` : whole;
}

export const fromRawUnits = rawUnitsToDecimal;
export const formatRawUnits = rawUnitsToDecimal;
export const fromSmallestUnits = rawUnitsToDecimal;

export function solToLamports(solDecimal) {
  return decimalToRawUnits(solDecimal, 'SOL');
}

export function lamportsToSol(lamports) {
  return rawUnitsToDecimal(lamports, 'SOL');
}

export function usdcToMicroUnits(usdcDecimal) {
  return decimalToRawUnits(usdcDecimal, 'USDC');
}

export function microUnitsToUsdc(microUnits) {
  return rawUnitsToDecimal(microUnits, 'USDC');
}

export function xnoToRaw(xnoDecimal) {
  return decimalToRawUnits(xnoDecimal, 'XNO');
}

export function rawToXno(nanoRaw) {
  return rawUnitsToDecimal(nanoRaw, 'XNO');
}

/**
 * Validates a merchant or payer wallet address for Solana or Nano.
 * Explicitly rejects the SPL USDC Mint contract address to prevent accidental token burn/loss.
 */
export function validateMerchantWallet(address, rail = 'solana') {
  if (typeof address !== 'string' || address.trim().length === 0) {
    return {
      valid: false,
      rail: String(rail || 'solana').toLowerCase(),
      address: String(address || ''),
      code: 'EMPTY_WALLET_ADDRESS',
      reason: 'Wallet address must be a non-empty string.',
    };
  }
  const trimmed = address.trim();
  const normalizedRail = String(rail || 'solana').trim().toLowerCase();

  if (normalizedRail === 'nano' || normalizedRail === 'xno') {
    if (!NANO_ADDRESS_REGEX.test(trimmed)) {
      return {
        valid: false,
        rail: 'nano',
        address: trimmed,
        code: 'INVALID_NANO_ADDRESS',
        reason: 'Nano wallet address must start with "nano_1" or "nano_3" followed by 59 Nano Base32 characters.',
      };
    }
    return { valid: true, rail: 'nano', address: trimmed, code: 'OK', reason: null };
  }

  if (normalizedRail !== 'solana') {
    return {
      valid: false,
      rail: normalizedRail,
      address: trimmed,
      code: 'UNSUPPORTED_RAIL',
      reason: `Unsupported payment rail "${normalizedRail}": expected "solana" or "nano".`,
    };
  }

  if (trimmed === CANONICAL_USDC_MINT) {
    return {
      valid: false,
      rail: 'solana',
      address: trimmed,
      code: 'MINT_ADDRESS_NOT_WALLET',
      reason: `Address ${CANONICAL_USDC_MINT} is the SPL USDC Mint contract, not a merchant receiving wallet.`,
    };
  }

  if (!BASE58_REGEX.test(trimmed)) {
    return {
      valid: false,
      rail: 'solana',
      address: trimmed,
      code: 'INVALID_SOLANA_BASE58',
      reason: 'Solana wallet address must be a valid Base58 public key between 32 and 44 characters.',
    };
  }

  return { valid: true, rail: 'solana', address: trimmed, code: 'OK', reason: null };
}

/**
 * Builds a standards-compliant Solana Pay transfer request URI (`solana:<recipient>?...`)
 * using exact decimal conversion (never IEEE-754 floats).
 */
export function buildSolanaPayUrl(params = {}) {
  if (!params || typeof params !== 'object') {
    throw new Error('buildSolanaPayUrl requires a parameters object');
  }
  const recipient = String(params.recipient || params.treasuryWallet || CANONICAL_SOLANA_TREASURY).trim();
  const walletCheck = validateMerchantWallet(recipient, 'solana');
  if (!walletCheck.valid) {
    throw new Error(`Invalid Solana Pay recipient: ${walletCheck.reason}`);
  }

  const asset = String(params.asset || params.currency || 'USDC').trim().toUpperCase();
  if (asset !== 'USDC' && asset !== 'SOL') {
    throw new Error(`Solana Pay URI supports "USDC" or "SOL", got "${asset}"`);
  }

  const queryParts = [];
  if (params.amount !== undefined && params.amount !== null && String(params.amount).trim() !== '') {
    const rawUnits = decimalToRawUnits(params.amount, asset);
    if (rawUnits <= 0n) {
      throw new Error('Solana Pay amount must be greater than zero');
    }
    const normalizedDecimal = rawUnitsToDecimal(rawUnits, asset);
    queryParts.push(`amount=${encodeURIComponent(normalizedDecimal)}`);
  }

  if (asset === 'USDC') {
    const mint = String(params.splToken || params.usdcMint || CANONICAL_USDC_MINT).trim();
    queryParts.push(`spl-token=${encodeURIComponent(mint)}`);
  }

  if (params.reference) {
    const ref = String(params.reference).trim();
    if (!BASE58_REGEX.test(ref)) {
      throw new Error(`Invalid Solana Pay reference key "${ref}": must be a valid Base58 public key`);
    }
    queryParts.push(`reference=${encodeURIComponent(ref)}`);
  }

  if (params.label) {
    queryParts.push(`label=${encodeURIComponent(String(params.label).trim())}`);
  }
  if (params.message) {
    queryParts.push(`message=${encodeURIComponent(String(params.message).trim())}`);
  }
  if (params.memo) {
    queryParts.push(`memo=${encodeURIComponent(String(params.memo).trim())}`);
  }

  const qs = queryParts.join('&');
  return qs.length > 0 ? `solana:${recipient}?${qs}` : `solana:${recipient}`;
}

/**
 * Signs a webhook JSON payload with HMAC-SHA256 in the format `t=<unix_seconds>,v1=<hex_digest>`.
 */
export function signWebhookPayload(payload, secret, timestampSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof secret !== 'string' || secret.trim().length < 8) {
    throw new Error('Webhook secret must be a string of at least 8 characters');
  }
  const ts = Number(timestampSeconds);
  if (!Number.isInteger(ts) || ts <= 0) {
    throw new Error('timestampSeconds must be a positive unix timestamp integer');
  }
  const rawBody =
    typeof payload === 'string'
      ? payload
      : Buffer.isBuffer(payload)
        ? payload.toString('utf8')
        : JSON.stringify(payload);
  const signedMessage = `${ts}.${rawBody}`;
  const digest = crypto.createHmac('sha256', secret).update(signedMessage, 'utf8').digest('hex');
  return `t=${ts},v1=${digest}`;
}

/**
 * Verifies an HMAC-SHA256 webhook signature header (`X-MoltAlpha-Signature: t=<ts>,v1=<hex>`)
 * with constant-time digest comparison and timestamp replay window enforcement.
 */
export function verifyWebhookSignature(payload, signatureHeader, secret, options = {}) {
  if (typeof secret !== 'string' || secret.trim().length === 0) {
    return {
      valid: false,
      code: 'WEBHOOK_SECRET_MISSING',
      reason: 'Webhook signing secret is required for verification.',
      timestamp: null,
    };
  }
  if (typeof signatureHeader !== 'string' || signatureHeader.trim().length === 0) {
    return {
      valid: false,
      code: 'WEBHOOK_SIGNATURE_MISSING',
      reason: 'Missing webhook signature header.',
      timestamp: null,
    };
  }

  const parts = signatureHeader.split(',').map((p) => p.trim());
  let timestampStr = null;
  const v1Signatures = [];
  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx <= 0) continue;
    const k = part.slice(0, eqIdx).trim();
    const v = part.slice(eqIdx + 1).trim();
    if (k === 't') timestampStr = v;
    if (k === 'v1' && /^[0-9a-fA-F]{64}$/.test(v)) v1Signatures.push(v.toLowerCase());
  }

  if (!timestampStr || !/^\d+$/.test(timestampStr) || v1Signatures.length === 0) {
    return {
      valid: false,
      code: 'WEBHOOK_SIGNATURE_MALFORMED',
      reason: 'Signature header must contain "t=<unix_timestamp>,v1=<64_char_hex_hmac>".',
      timestamp: null,
    };
  }

  const timestamp = Number(timestampStr);
  const toleranceSeconds =
    typeof options.toleranceSeconds === 'number' && options.toleranceSeconds >= 0
      ? options.toleranceSeconds
      : 300;
  const nowSeconds =
    typeof options.nowSeconds === 'number' ? options.nowSeconds : Math.floor(Date.now() / 1000);

  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) {
    return {
      valid: false,
      code: 'WEBHOOK_TIMESTAMP_EXPIRED',
      reason: `Webhook timestamp ${timestamp} is outside the allowed ${toleranceSeconds}s replay window (now=${nowSeconds}).`,
      timestamp,
    };
  }

  const rawBody =
    typeof payload === 'string'
      ? payload
      : Buffer.isBuffer(payload)
        ? payload.toString('utf8')
        : JSON.stringify(payload);
  const expectedHex = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex');
  const expectedBuf = Buffer.from(expectedHex, 'hex');

  let matched = false;
  for (const candidateHex of v1Signatures) {
    const candidateBuf = Buffer.from(candidateHex, 'hex');
    if (
      candidateBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(candidateBuf, expectedBuf)
    ) {
      matched = true;
      break;
    }
  }

  if (!matched) {
    return {
      valid: false,
      code: 'WEBHOOK_SIGNATURE_MISMATCH',
      reason: 'HMAC-SHA256 signature digest does not match payload.',
      timestamp,
    };
  }

  return {
    valid: true,
    code: 'OK',
    reason: null,
    timestamp,
  };
}

/**
 * Constant-time verification for inbound `X-Webhook-Secret` headers (`POST /v1/payments/webhook`).
 */
export function verifyInboundWebhookSecret(providedSecret, expectedSecret) {
  if (
    typeof providedSecret !== 'string' ||
    typeof expectedSecret !== 'string' ||
    providedSecret.length === 0 ||
    expectedSecret.length === 0
  ) {
    return false;
  }
  const a = Buffer.from(providedSecret, 'utf8');
  const b = Buffer.from(expectedSecret, 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

/**
 * Parses raw /v1/payments/config JSON text while preserving >2^53 integers (such as nano_raw)
 * as exact strings so JSON.parse never rounds 30+ digit integers.
 */
export function parsePaymentConfigJson(rawText) {
  const parsed = parseJsonPreservingLargeInts(rawText);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Malformed payment config JSON');
  }
  return parsed;
}

export const parsePaymentConfigText = parsePaymentConfigJson;
export const parsePaymentsConfigJson = parsePaymentConfigJson;
export const parseRawPaymentConfig = parsePaymentConfigJson;

function resolveBaseUrl(options = {}) {
  return String(options.gatewayUrl || options.baseUrl || DEFAULT_API_GATEWAY_URL).replace(/\/+$/, '');
}

export async function getConfig(options = {}) {
  const baseUrl = resolveBaseUrl(options);
  return requestJson(`${baseUrl}/v1/payments/config`, {
    ...options,
    preserveLargeIntegers: true,
  });
}

export const getPaymentConfig = getConfig;
export const fetchPaymentConfig = getConfig;

export async function createInvoice(payload = {}, options = {}) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('createInvoice requires a payload object');
  }
  const baseUrl = resolveBaseUrl(options);
  const rawRail = String(payload.rail || payload.network || 'solana').trim().toLowerCase();
  if (rawRail !== 'solana' && rawRail !== 'nano') {
    throw new Error(`Unsupported payment rail/network "${rawRail}": expected "solana" or "nano"`);
  }

  const rawAsset = String(
    payload.asset || payload.currency || (rawRail === 'nano' ? 'XNO' : 'USDC')
  )
    .trim()
    .toUpperCase();
  if (!['USDC', 'SOL', 'XNO', 'NANO'].includes(rawAsset)) {
    throw new Error(`Unsupported payment asset/currency "${rawAsset}": expected "USDC", "SOL", or "XNO"`);
  }
  if (rawRail === 'solana' && (rawAsset === 'XNO' || rawAsset === 'NANO')) {
    throw new Error('Asset "XNO" requires rail/network="nano"');
  }

  if (payload.amount !== undefined && payload.amount !== null) {
    const validatedRaw = decimalToRawUnits(payload.amount, rawAsset);
    if (validatedRaw <= 0n) {
      throw new Error('Payment amount must be greater than zero');
    }
  }

  const expectedPayer = payload.expected_payer || payload.expectedPayer;
  if (expectedPayer !== undefined && expectedPayer !== null && String(expectedPayer).trim() !== '') {
    const check = validateMerchantWallet(String(expectedPayer).trim(), rawRail);
    if (!check.valid) {
      throw new Error(`Invalid expected_payer address: ${check.reason}`);
    }
  }

  const targetApiKey = payload.target_api_key || payload.targetApiKey;
  const body = {
    target_tier: payload.target_tier || payload.tier || 'tier_starter',
    rail: rawRail,
    asset: rawAsset === 'NANO' ? 'XNO' : rawAsset,
    ...(payload.cluster ? { cluster: String(payload.cluster).trim().toLowerCase() } : {}),
    ...(expectedPayer ? { expected_payer: String(expectedPayer).trim() } : {}),
    ...(targetApiKey ? { target_api_key: String(targetApiKey).trim() } : {}),
  };

  const mergedHeaders = { ...(options.headers || {}) };
  const idempotencyKey = payload.idempotencyKey || payload.idempotency_key || options.idempotencyKey;
  if (idempotencyKey) {
    mergedHeaders['X-Idempotency-Key'] = String(idempotencyKey).trim();
  }

  return requestJson(`${baseUrl}/v1/payments/invoice`, {
    ...options,
    headers: mergedHeaders,
    method: 'POST',
    body,
    preserveLargeIntegers: true,
  });
}

export const createPaymentInvoice = createInvoice;
export const createPaymentRequest = createInvoice;

export async function getInvoice(invoiceId, options = {}) {
  if (typeof invoiceId !== 'string' || invoiceId.trim().length === 0) {
    throw new Error('invoiceId must be a non-empty string');
  }
  const baseUrl = resolveBaseUrl(options);
  return requestJson(`${baseUrl}/v1/payments/invoice/${encodeURIComponent(invoiceId.trim())}`, {
    ...options,
    preserveLargeIntegers: true,
  });
}

export const getInvoiceStatus = getInvoice;
export const fetchInvoice = getInvoice;
export const getPaymentStatus = getInvoice;

export async function getTransactionStatus(signature, options = {}) {
  if (typeof signature !== 'string' || !BASE58_SIGNATURE_REGEX.test(signature.trim())) {
    throw new Error('signature must be a valid Base58 Solana transaction signature (64-90 characters)');
  }
  const baseUrl = resolveBaseUrl(options);
  return requestJson(`${baseUrl}/v1/payments/status/${encodeURIComponent(signature.trim())}`, {
    ...options,
    preserveLargeIntegers: true,
  });
}

export async function claimInvoiceCredential(invoiceId, claimSecret, options = {}) {
  if (typeof invoiceId !== 'string' || invoiceId.trim().length === 0) {
    throw new Error('invoiceId must be a non-empty string');
  }
  if (typeof claimSecret !== 'string' || !claimSecret.trim().startsWith('sec_') || claimSecret.trim().length < 20) {
    throw new Error('claimSecret must be a valid claim_secret starting with "sec_"');
  }
  const baseUrl = resolveBaseUrl(options);
  return requestJson(`${baseUrl}/v1/payments/invoice/${encodeURIComponent(invoiceId.trim())}/claim`, {
    ...options,
    method: 'POST',
    body: { claim_secret: claimSecret.trim() },
    preserveLargeIntegers: true,
  });
}

export const claimCredential = claimInvoiceCredential;

export async function verifySolanaPayment(payload = {}, options = {}) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('verifySolanaPayment requires a payload object');
  }
  const sig = payload.transaction_signature || payload.tx_signature || payload.signature;
  if (typeof sig !== 'string' || sig.trim().length === 0) {
    throw new Error('transaction_signature is required');
  }
  const baseUrl = resolveBaseUrl(options);
  const body = {
    ...payload,
    transaction_signature: sig.trim(),
    ...(payload.invoiceId && !payload.invoice_id ? { invoice_id: payload.invoiceId } : {}),
    ...(payload.claimSecret && !payload.claim_secret ? { claim_secret: payload.claimSecret } : {}),
    ...(payload.expectedPayer && !payload.expected_payer ? { expected_payer: payload.expectedPayer } : {}),
    ...(payload.expectedReference && !payload.expected_reference
      ? { expected_reference: payload.expectedReference }
      : {}),
  };
  return requestJson(`${baseUrl}/v1/payments/verify-solana`, {
    ...options,
    method: 'POST',
    body,
    preserveLargeIntegers: true,
  });
}

export const verifySolana = verifySolanaPayment;

export async function verifyNanoPayment(payload = {}, options = {}) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('verifyNanoPayment requires a payload object');
  }
  const blockHash = payload.block_hash || payload.tx_hash || payload.hash || payload.blockHash;
  if (typeof blockHash !== 'string' || blockHash.trim().length === 0) {
    throw new Error('block_hash is required');
  }
  const baseUrl = resolveBaseUrl(options);
  const body = {
    ...payload,
    block_hash: blockHash.trim().toLowerCase(),
    ...(payload.invoiceId && !payload.invoice_id ? { invoice_id: payload.invoiceId } : {}),
    ...(payload.claimSecret && !payload.claim_secret ? { claim_secret: payload.claimSecret } : {}),
  };
  return requestJson(`${baseUrl}/v1/payments/verify-nano`, {
    ...options,
    method: 'POST',
    body,
    preserveLargeIntegers: true,
  });
}

export const verifyNano = verifyNanoPayment;

export async function reconcilePayment(payload = {}, options = {}) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('reconcilePayment requires a payload object');
  }
  const sig = payload.transaction_signature || payload.tx_signature || payload.signature;
  if (typeof sig !== 'string' || sig.trim().length === 0) {
    throw new Error('transaction_signature is required for reconciliation');
  }
  const baseUrl = resolveBaseUrl(options);
  return requestJson(`${baseUrl}/v1/payments/reconcile`, {
    ...options,
    method: 'POST',
    body: {
      ...payload,
      transaction_signature: sig.trim(),
    },
    preserveLargeIntegers: true,
  });
}

export const reconcile = reconcilePayment;

export class PaymentsClient {
  constructor(options = {}) {
    this.options = { ...options };
  }

  parsePaymentConfigJson(rawText) {
    return parsePaymentConfigJson(rawText);
  }

  toRawUnits(amountInput, asset = 'SOL') {
    return decimalToRawUnits(amountInput, asset);
  }

  fromRawUnits(rawInput, asset = 'SOL') {
    return rawUnitsToDecimal(rawInput, asset);
  }

  validateMerchantWallet(address, rail = 'solana') {
    return validateMerchantWallet(address, rail);
  }

  buildSolanaPayUrl(params = {}) {
    return buildSolanaPayUrl(params);
  }

  signWebhookPayload(payload, secret, timestampSeconds) {
    return signWebhookPayload(payload, secret, timestampSeconds);
  }

  verifyWebhookSignature(payload, signatureHeader, secret, options = {}) {
    return verifyWebhookSignature(payload, signatureHeader, secret, options);
  }

  async getConfig(overrideOptions = {}) {
    return getConfig({ ...this.options, ...overrideOptions });
  }

  async create(payload = {}, overrideOptions = {}) {
    return createInvoice(payload, { ...this.options, ...overrideOptions });
  }

  async createInvoice(payload = {}, overrideOptions = {}) {
    return createInvoice(payload, { ...this.options, ...overrideOptions });
  }

  async getStatus(invoiceId, overrideOptions = {}) {
    return getInvoice(invoiceId, { ...this.options, ...overrideOptions });
  }

  async getInvoice(invoiceId, overrideOptions = {}) {
    return getInvoice(invoiceId, { ...this.options, ...overrideOptions });
  }

  async getTransactionStatus(signature, overrideOptions = {}) {
    return getTransactionStatus(signature, { ...this.options, ...overrideOptions });
  }

  async claimCredential(invoiceId, claimSecret, overrideOptions = {}) {
    return claimInvoiceCredential(invoiceId, claimSecret, { ...this.options, ...overrideOptions });
  }

  async verifySolanaPayment(payload = {}, overrideOptions = {}) {
    return verifySolanaPayment(payload, { ...this.options, ...overrideOptions });
  }

  async verifySolana(payload = {}, overrideOptions = {}) {
    return verifySolanaPayment(payload, { ...this.options, ...overrideOptions });
  }

  async verifyNanoPayment(payload = {}, overrideOptions = {}) {
    return verifyNanoPayment(payload, { ...this.options, ...overrideOptions });
  }

  async verifyNano(payload = {}, overrideOptions = {}) {
    return verifyNanoPayment(payload, { ...this.options, ...overrideOptions });
  }

  async reconcilePayment(payload = {}, overrideOptions = {}) {
    return reconcilePayment(payload, { ...this.options, ...overrideOptions });
  }

  async reconcile(payload = {}, overrideOptions = {}) {
    return reconcilePayment(payload, { ...this.options, ...overrideOptions });
  }
}

export const MoltAlphaPaymentsClient = PaymentsClient;
