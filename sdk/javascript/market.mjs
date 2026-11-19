/**
 * MoltALPHA Public Market Data SDK (JavaScript ESM)
 * Read-only client for:
 *   - GET /api/market-intelligence
 *   - GET /api/market-candles?pair=SOL-USD&granularity=3600
 *   - GET /api/v1/forecasts
 *
 * Security & Data Integrity Guarantees:
 *   - Automatically strips `simulatedDemoFallback` from every token entry.
 *   - Preserves `null` values (e.g., `JUP.priceUsd = null`) when live feeds are unavailable.
 *   - Never fabricates missing venues or instruments (e.g., Metal X when absent).
 *   - Rejects HTML SPA fallback responses (such as /api/v1/market/sol-candles).
 */

import { DEFAULT_WWW_BASE_URL, requestJson } from './http.mjs';

export function sanitizeMarketIntelligencePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Malformed market intelligence response: expected JSON object');
  }
  if (!payload.tokens || typeof payload.tokens !== 'object' || Array.isArray(payload.tokens)) {
    throw new Error('Invalid market intelligence schema: missing required "tokens" object');
  }

  const sanitizedTokens = {};
  for (const [symbol, tokenEntry] of Object.entries(payload.tokens)) {
    if (!tokenEntry || typeof tokenEntry !== 'object') continue;
    const copy = { ...tokenEntry };
    delete copy.simulatedDemoFallback;
    if (copy.priceUsd === undefined) {
      copy.priceUsd = null;
    }
    sanitizedTokens[symbol] = copy;
  }

  const retrievedAtIso = new Date().toISOString();
  return {
    ...payload,
    tokens: sanitizedTokens,
    marketTimestamp: payload.timestamp || payload.marketTimestamp || null,
    retrievedAt: retrievedAtIso,
    retrievedAtIso,
  };
}

export async function getMarketIntelligence(options = {}) {
  const baseUrl = String(options.baseUrl || DEFAULT_WWW_BASE_URL).replace(/\/+$/, '');
  const data = await requestJson(`${baseUrl}/api/market-intelligence`, options);
  return sanitizeMarketIntelligencePayload(data);
}

export const fetchMarketIntelligence = getMarketIntelligence;
export const getIntelligence = getMarketIntelligence;
export const getMarkets = getMarketIntelligence;

export async function getMarketCandles(options = {}) {
  const baseUrl = String(options.baseUrl || DEFAULT_WWW_BASE_URL).replace(/\/+$/, '');
  const pair = String(options.pair || 'SOL-USD').trim();
  const granularity = Number.isFinite(Number(options.granularity)) ? Math.trunc(Number(options.granularity)) : 3600;
  if (!pair) {
    throw new Error('pair is required for getMarketCandles');
  }
  const url = `${baseUrl}/api/market-candles?pair=${encodeURIComponent(pair)}&granularity=${encodeURIComponent(granularity)}`;
  const data = await requestJson(url, options);
  if (!data || typeof data !== 'object' || !Array.isArray(data.candles)) {
    throw new Error('Invalid market candles schema: missing "candles" array');
  }
  return {
    ...data,
    retrievedAtIso: new Date().toISOString(),
  };
}

export const fetchMarketCandles = getMarketCandles;
export const getCandles = getMarketCandles;
export const getSolCandles = getMarketCandles;

export async function getForecasts(options = {}) {
  const baseUrl = String(options.baseUrl || DEFAULT_WWW_BASE_URL).replace(/\/+$/, '');
  const data = await requestJson(`${baseUrl}/api/v1/forecasts`, options);
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid forecasts response: expected JSON object');
  }
  return {
    ...data,
    retrievedAtIso: new Date().toISOString(),
  };
}

export const fetchForecasts = getForecasts;

export class MarketClient {
  constructor(options = {}) {
    this.options = { ...options };
  }

  async getMarketIntelligence(overrideOptions = {}) {
    return getMarketIntelligence({ ...this.options, ...overrideOptions });
  }

  async getMarketCandles(overrideOptions = {}) {
    return getMarketCandles({ ...this.options, ...overrideOptions });
  }

  async getForecasts(overrideOptions = {}) {
    return getForecasts({ ...this.options, ...overrideOptions });
  }
}

export const MoltAlphaMarketClient = MarketClient;
