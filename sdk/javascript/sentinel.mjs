/**
 * MoltALPHA Public Sentinel API Client (JavaScript ESM)
 * Read-only client for production Sentinel risk & telemetry endpoints on https://api.moltalpha.dev:
 *   - GET /v1/sentinel/public-key (Public, 0 credits)
 *   - GET /v1/sentinel/feed (SENTINEL_MEMBER)
 *   - GET /v1/sentinel/anomalies/live (SENTINEL_PRO)
 *   - GET /v1/sentinel/pools/{pool_address}/risk (SENTINEL_MEMBER)
 *   - GET /v1/sentinel/pools/{pool_address}/observations (SENTINEL_PRO)
 *   - GET /v1/sentinel/pools/{pool_address}/history (SENTINEL_PRO; note: /v1/sentinel/history returns 404)
 *   - GET /v1/sentinel/agent/{agent_handle} (SENTINEL_MEMBER)
 */

import { DEFAULT_API_GATEWAY_URL, requestJson } from './http.mjs';

function resolveBaseUrl(options = {}) {
  return String(options.gatewayUrl || options.baseUrl || DEFAULT_API_GATEWAY_URL).replace(/\/+$/, '');
}

function validateNonEmptyIdentifier(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Invalid or missing ${fieldName}: non-empty string is required`);
  }
  const trimmed = value.trim();
  if (trimmed.includes('/') || trimmed.includes('..') || trimmed.includes('?')) {
    throw new Error(`Invalid ${fieldName}: path traversal characters are forbidden`);
  }
  return trimmed;
}

export async function getPublicKey(options = {}) {
  const baseUrl = resolveBaseUrl(options);
  const data = await requestJson(`${baseUrl}/v1/sentinel/public-key`, options);
  if (!data || typeof data !== 'object' || !data.key_id) {
    throw new Error('Malformed /v1/sentinel/public-key response');
  }
  return data;
}

export const fetchPublicKey = getPublicKey;
export const getSentinelPublicKey = getPublicKey;

export async function getFeed(options = {}) {
  const baseUrl = resolveBaseUrl(options);
  return requestJson(`${baseUrl}/v1/sentinel/feed`, options);
}

export const fetchFeed = getFeed;
export const getSentinelFeed = getFeed;

export async function getLiveAnomalies(options = {}) {
  const baseUrl = resolveBaseUrl(options);
  return requestJson(`${baseUrl}/v1/sentinel/anomalies/live`, options);
}

export const getAnomaliesLive = getLiveAnomalies;
export const getAnomalies = getLiveAnomalies;
export const fetchLiveAnomalies = getLiveAnomalies;

export async function getPoolRisk(poolAddress, options = {}) {
  const addr = validateNonEmptyIdentifier(poolAddress, 'poolAddress');
  const baseUrl = resolveBaseUrl(options);
  return requestJson(`${baseUrl}/v1/sentinel/pools/${encodeURIComponent(addr)}/risk`, options);
}

export const fetchPoolRisk = getPoolRisk;

export async function getPoolObservations(poolAddress, options = {}) {
  const addr = validateNonEmptyIdentifier(poolAddress, 'poolAddress');
  const baseUrl = resolveBaseUrl(options);
  return requestJson(`${baseUrl}/v1/sentinel/pools/${encodeURIComponent(addr)}/observations`, options);
}

export const fetchPoolObservations = getPoolObservations;

export async function getPoolHistory(poolAddress, options = {}) {
  const addr = validateNonEmptyIdentifier(poolAddress, 'poolAddress');
  const baseUrl = resolveBaseUrl(options);
  return requestJson(`${baseUrl}/v1/sentinel/pools/${encodeURIComponent(addr)}/history`, options);
}

export const fetchPoolHistory = getPoolHistory;

export async function getAgentProfile(agentHandle, options = {}) {
  const handle = validateNonEmptyIdentifier(agentHandle, 'agentHandle');
  const baseUrl = resolveBaseUrl(options);
  return requestJson(`${baseUrl}/v1/sentinel/agent/${encodeURIComponent(handle)}`, options);
}

export const getAgent = getAgentProfile;
export const fetchAgent = getAgentProfile;

export class SentinelClient {
  constructor(options = {}) {
    this.options = { ...options };
  }

  async getPublicKey(overrideOptions = {}) {
    return getPublicKey({ ...this.options, ...overrideOptions });
  }

  async getFeed(overrideOptions = {}) {
    return getFeed({ ...this.options, ...overrideOptions });
  }

  async getLiveAnomalies(overrideOptions = {}) {
    return getLiveAnomalies({ ...this.options, ...overrideOptions });
  }

  async getPoolRisk(poolAddress, overrideOptions = {}) {
    return getPoolRisk(poolAddress, { ...this.options, ...overrideOptions });
  }

  async getPoolObservations(poolAddress, overrideOptions = {}) {
    return getPoolObservations(poolAddress, { ...this.options, ...overrideOptions });
  }

  async getPoolHistory(poolAddress, overrideOptions = {}) {
    return getPoolHistory(poolAddress, { ...this.options, ...overrideOptions });
  }

  async getAgentProfile(agentHandle, overrideOptions = {}) {
    return getAgentProfile(agentHandle, { ...this.options, ...overrideOptions });
  }
}

export const MoltAlphaSentinelClient = SentinelClient;
