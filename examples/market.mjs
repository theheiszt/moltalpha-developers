/**
 * Read-only Market Intelligence client example.
 * Supports the live /api/market-intelligence tokens schema (stripping simulatedDemoFallback)
 * as well as legacy LIVE_OBSERVATIONS_ONLY observations payloads.
 * Fails closed if the upstream market feed returns HTTP 503 or malformed payloads.
 */
export async function getMarketObservations(fetchImpl = fetch) {
  const response = await fetchImpl('https://www.moltalpha.dev/api/market-intelligence', {
    headers: { Accept: 'application/json' },
  });

  if (response.status === 503) {
    throw new Error('Upstream market observations unavailable (HTTP 503)');
  }
  if (!response.ok) {
    throw new Error(`Market request failed: HTTP ${response.status}`);
  }

  const data = await response.json();
  if (!data || typeof data !== 'object') {
    throw new Error('Unsupported market response');
  }

  // Live production schema: { ok: true, timestamp: "...", tokens: { SOL: {...}, ... } }
  if (data.tokens && typeof data.tokens === 'object' && !Array.isArray(data.tokens)) {
    const cleanTokens = {};
    for (const [symbol, entry] of Object.entries(data.tokens)) {
      if (!entry || typeof entry !== 'object') continue;
      const copy = { ...entry };
      delete copy.simulatedDemoFallback;
      cleanTokens[symbol] = copy;
    }
    return {
      ...data,
      tokens: cleanTokens,
    };
  }

  // Legacy observations schema compatibility
  if (data.mode === 'LIVE_OBSERVATIONS_ONLY' && Array.isArray(data.markets)) {
    return data;
  }

  throw new Error('Unsupported market response');
}
