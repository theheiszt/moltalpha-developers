# Market Data SDK & Provenance Guide

The MoltALPHA Market Data endpoints live on `https://www.moltalpha.dev` and expose real-time cryptocurrency spot observations, OHLCV candles, and calibrated forecasts.

---

## 1. Production Endpoints

1. **`GET https://www.moltalpha.dev/api/market-intelligence`**
   - Returns `{ ok: true, timestamp: "<ISO-8601>", tokens: { SOL: {...}, JUP: {...}, BONK: {...} }, macro: {...} }`.
   - Each token includes `priceUsd`, `change24hPct`, `priceProvenance` (e.g., `"COINBASE_EXCHANGE_LIVE"`), and `isLive`.
   - **Important:** When an upstream feed is unavailable for a token (such as `JUP`), `priceUsd` is `null` and the raw endpoint may include a `simulatedDemoFallback` object for UI preview purposes. The official `MarketClient` in `sdk/javascript/market.mjs` and `sdk/python/moltalpha_sdk/market.py` **automatically strips `simulatedDemoFallback`** and preserves `priceUsd: null` so trading and risk agents never consume synthetic fallback numbers.

2. **`GET https://www.moltalpha.dev/api/market-candles?pair=SOL-USD&granularity=3600`**
   - Returns `{ ok: true, pair: "SOL/USD", granularity: 3600, provenance: "COINBASE_EXCHANGE_LIVE", candles: [...], latestPrice: ... }`.
   - **Route Note:** Always call `/api/market-candles`. Do **not** call `/api/v1/market/sol-candles`, which is not a registered serverless route and returns the frontend SPA `text/html` fallback. Both SDKs automatically detect and reject `text/html` responses.

3. **`GET https://www.moltalpha.dev/api/v1/forecasts`**
   - Returns calibrated directional forecast envelopes.

---

## 2. Provenance & Timestamp Separation

The Market Data SDK attaches `retrievedAtIso` (when the client received the response) alongside `marketTimestamp` (`payload.timestamp`, when the market snapshot was generated), and never fabricates missing exchange venues (such as Metal X pairs when absent from the live response).
