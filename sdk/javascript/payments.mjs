/**
 * MoltALPHA Public Payments & Exact Integer Unit SDK (JavaScript ESM)
 * Client for multi-rail payment discovery, invoice lifecycle, and settlement verification:
 *   - GET  /v1/payments/config
 *   - POST /v1/payments/invoice
 *   - GET  /v1/payments/invoice/{invoice_id}
 *   - POST /v1/payments/verify-solana
 *   - POST /v1/payments/verify-nano
 *   - POST /v1/payments/reconcile
 *
 * CRITICAL ARITHMETIC RULE:
 *   Never use JavaScript Number / parseFloat for payment amounts.
 *   Nano raw units (10^30 per XNO) exceed Number.MAX_SAFE_INTEGER (2^53 - 1).
 *   This module uses quoteUnsafeJsonIntegers() and native BigInt arithmetic exclusively.
 */

import { DEFAULT_API_GATEWAY_URL, parseJsonPreservingLargeInts, requestJson } from './http.mjs';

export const CANONICAL_SOLANA_TREASURY = 'BU5zBur46YjnCaY34XGBTJ8KSAG9EExjpZA58wDo7wAx';
export const CANONICAL_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const CANONICAL_NANO_TREASURY = 'nano_1s5ce5k7bj74sp31m3opq8xwx44stc5dgw6w8uajyg61xjg9wiaae4uby6pu';

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
  const body = {
    target_tier: payload.target_tier || payload.tier || 'tier_starter',
    rail: payload.rail || 'solana',
    asset: payload.asset || ((payload.rail || '').toLowerCase() === 'nano' ? 'XNO' : 'USDC'),
    ...(payload.cluster ? { cluster: payload.cluster } : {}),
    ...(payload.expected_payer ? { expected_payer: payload.expected_payer } : {}),
    ...(payload.target_api_key ? { target_api_key: payload.target_api_key } : {}),
  };
  return requestJson(`${baseUrl}/v1/payments/invoice`, {
    ...options,
    method: 'POST',
    body,
    preserveLargeIntegers: true,
  });
}

export const createPaymentInvoice = createInvoice;

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

export async function verifySolanaPayment(payload = {}, options = {}) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('verifySolanaPayment requires a payload object');
  }
  const sig = payload.transaction_signature || payload.tx_signature || payload.signature;
  if (typeof sig !== 'string' || sig.trim().length === 0) {
    throw new Error('transaction_signature is required');
  }
  const baseUrl = resolveBaseUrl(options);
  return requestJson(`${baseUrl}/v1/payments/verify-solana`, {
    ...options,
    method: 'POST',
    body: {
      ...payload,
      transaction_signature: sig.trim(),
    },
    preserveLargeIntegers: true,
  });
}

export const verifySolana = verifySolanaPayment;

export async function verifyNanoPayment(payload = {}, options = {}) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('verifyNanoPayment requires a payload object');
  }
  const blockHash = payload.block_hash || payload.tx_hash || payload.hash;
  if (typeof blockHash !== 'string' || blockHash.trim().length === 0) {
    throw new Error('block_hash is required');
  }
  const baseUrl = resolveBaseUrl(options);
  return requestJson(`${baseUrl}/v1/payments/verify-nano`, {
    ...options,
    method: 'POST',
    body: {
      ...payload,
      block_hash: blockHash.trim(),
    },
    preserveLargeIntegers: true,
  });
}

export const verifyNano = verifyNanoPayment;

export async function reconcilePayment(payload = {}, options = {}) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('reconcilePayment requires a payload object');
  }
  const baseUrl = resolveBaseUrl(options);
  return requestJson(`${baseUrl}/v1/payments/reconcile`, {
    ...options,
    method: 'POST',
    body: payload,
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

  async getConfig(overrideOptions = {}) {
    return getConfig({ ...this.options, ...overrideOptions });
  }

  async createInvoice(payload = {}, overrideOptions = {}) {
    return createInvoice(payload, { ...this.options, ...overrideOptions });
  }

  async getInvoice(invoiceId, overrideOptions = {}) {
    return getInvoice(invoiceId, { ...this.options, ...overrideOptions });
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
