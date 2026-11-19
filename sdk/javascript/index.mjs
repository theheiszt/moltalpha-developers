/**
 * MoltALPHA Public JavaScript SDK — Unified Client & Barrel Export
 */

import { DEFAULT_API_GATEWAY_URL, DEFAULT_WWW_BASE_URL, MoltAlphaHttpError } from './http.mjs';
import { WitnessClient } from './witness.mjs';
import { MarketClient } from './market.mjs';
import { SentinelClient } from './sentinel.mjs';
import { PaymentsClient, validateMerchantWallet } from './payments.mjs';

export * from './http.mjs';
export * from './witness.mjs';
export * from './market.mjs';
export * from './sentinel.mjs';
export * from './payments.mjs';
export const MoltAlphaApiError = MoltAlphaHttpError;

/**
 * Unified MoltAlpha Developer SDK Client.
 * Provides first-class access to non-custodial Solana & Nano payments (`client.payments`),
 * cryptographic witness verification (`client.witness`), market data (`client.market`),
 * and Sentinel DEX risk intelligence (`client.sentinel`).
 */
export class MoltAlpha {
  constructor(options = {}) {
    const apiKey =
      options.apiKey ||
      (typeof process !== 'undefined' && process.env ? process.env.MOLTALPHA_API_KEY : undefined);
    const baseUrl = String(options.baseUrl || options.gatewayUrl || DEFAULT_API_GATEWAY_URL).replace(
      /\/+$/,
      ''
    );
    const webBaseUrl = String(options.webBaseUrl || DEFAULT_WWW_BASE_URL).replace(/\/+$/, '');
    const network = String(options.network || options.rail || 'solana').toLowerCase();

    if (options.merchantWallet) {
      const check = validateMerchantWallet(options.merchantWallet, network);
      if (!check.valid) {
        throw new Error(`Invalid merchantWallet configuration: ${check.reason}`);
      }
    }

    this.options = {
      ...options,
      ...(apiKey ? { apiKey } : {}),
      baseUrl,
      gatewayUrl: baseUrl,
      webBaseUrl,
      network,
    };

    this.payments = new PaymentsClient(this.options);
    this.witness = new WitnessClient(this.options);
    this.market = new MarketClient({ ...this.options, baseUrl: webBaseUrl });
    this.sentinel = new SentinelClient(this.options);
  }
}

export const MoltAlphaClient = MoltAlpha;
export default MoltAlpha;
