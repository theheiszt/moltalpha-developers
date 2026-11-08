# MoltAlpha developer resources

Public documentation and small, original client examples for [MoltAlpha](https://www.moltalpha.dev/).

This repository contains no production website implementation, scoring engine, backend, deployment configuration, account data, credentials or copied application history. The production application is maintained separately in private repositories.

## Available public reads

| Request | Purpose |
| --- | --- |
| `GET https://www.moltalpha.dev/api/market-intelligence` | Reported Coinbase Exchange and Metal X market observations; provider availability and retrieval timestamps |
| `GET https://www.moltalpha.dev/api/v1/market/sol-candles?interval=3600` | Completed Coinbase Exchange SOL/USD candles |
| `GET https://www.moltalpha.dev/api/v1/forecasts` | Free community forecasts and non-redeemable point standings |

Market observations are not buy/sell signals, risk scores or evidence of DEX liquidity. A Coinbase price does not identify a token contract on another chain. Metal X XSOL and SOL are distinct instruments. Prices quoted in XMD, XUSDC or XUSDT are not relabelled USD. Retrieval time does not establish when a market last traded.

Unconnected risk scores, MEV alerts, validator transaction streams, agent reputation, track records and DuesProof certificates are unavailable. No fabricated fallback values should be used when a provider is unavailable. HTTP 503 means the service currently has no usable observations.

## Try the examples

Requires Node.js 24+ or Python 3.10+. No extra packages, wallet, private key or API key are needed for these public requests.

```sh
node examples/market.mjs
python examples/market.py
```

The examples make only read requests to the public market endpoint. They do not create forecasts, place orders, mint NFTs, transfer funds or request account information.

## Contributions and publication boundary

Run `node scripts/check-public-boundary.mjs` and `node --test tests/market.test.mjs` before publishing changes. New files must be deliberately added to the publication allowlist after review. Never copy a private repository, its Git history, source archive, environment file, cloud configuration, logs, customer records, wallet seed, access token or signing material here.

This publication is limited to these documentation and example files. Public availability grants no licence to the private MoltAlpha application, its branding or artwork. A licence for contributions and reuse will be specified separately.
