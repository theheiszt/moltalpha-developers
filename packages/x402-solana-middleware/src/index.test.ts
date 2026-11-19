import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalizeReplayTxHash,
  createX402SolanaMiddleware,
  InMemoryX402ReplayStore,
  parseX402PaymentHeader,
  SOLANA_MAINNET_USDC_MINT,
  type X402RequestLike,
  type X402ResponseLike,
} from './index';

const TREASURY_SOL = 'BU5zBur46YjnCaY34XGBTJ8KSAG9EExjpZA58wDo7wAx';
const TREASURY_ATA = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin';
const TREASURY_NANO = 'nano_1s5ce5k7bj74sp31m3opq8xwx44stc5dgw6w8uajyg61xjg9wiaae4uby6pu';
const VALID_SOL_SIG = '5VERv8NMvzbJMEdV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUc';
const VALID_NANO_HASH = 'A'.repeat(64);

function makeMockRes() {
  let statusCode = 200;
  let body: unknown = null;
  const headers: Record<string, string> = {};
  const res: X402ResponseLike = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
    json(payload: unknown) {
      body = payload;
    },
  };
  return { res, getStatus: () => statusCode, getBody: () => body, headers };
}

function makeSolanaTxResponse(overrides?: {
  slot?: number | null;
  blockTime?: number | null;
  preAmount?: string;
  postAmount?: string;
  ixAmount?: string;
  ixMint?: string;
  includeIx?: boolean;
}) {
  const nowSec = Math.floor(Date.now() / 1000);
  const slot = overrides && 'slot' in overrides ? overrides.slot : 312_900_001;
  const blockTime = overrides && 'blockTime' in overrides ? overrides.blockTime : nowSec - 15;
  const preAmount = overrides?.preAmount ?? '100000';
  const postAmount = overrides?.postAmount ?? '150000';
  const ixAmount = overrides?.ixAmount ?? '50000';
  const ixMint = overrides?.ixMint ?? SOLANA_MAINNET_USDC_MINT;
  const includeIx = overrides?.includeIx ?? true;

  return new Response(
    JSON.stringify({
      result: {
        slot,
        blockTime,
        transaction: {
          message: {
            accountKeys: ['SenderWallet1111111111111111111111111111111', TREASURY_ATA],
            instructions: includeIx
              ? [
                  {
                    program: 'spl-token',
                    parsed: {
                      type: 'transferChecked',
                      info: {
                        destination: TREASURY_ATA,
                        mint: ixMint,
                        tokenAmount: { amount: ixAmount },
                      },
                    },
                  },
                ]
              : [],
          },
        },
        meta: {
          err: null,
          preTokenBalances: [
            {
              accountIndex: 1,
              owner: TREASURY_SOL,
              mint: SOLANA_MAINNET_USDC_MINT,
              uiTokenAmount: { amount: preAmount },
            },
          ],
          postTokenBalances: [
            {
              accountIndex: 1,
              owner: TREASURY_SOL,
              mint: SOLANA_MAINNET_USDC_MINT,
              uiTokenAmount: { amount: postAmount },
            },
          ],
        },
      },
    }),
    { status: 200 }
  );
}

describe('@moltalpha/x402-solana-middleware', () => {
  it('returns an HTTP 402 x402 challenge listing Solana USDC and Zero-Fee Nano when unpaid', async () => {
    const mw = createX402SolanaMiddleware({
      resourceDescription: 'Solana DEX Pool Risk Assessment',
      solanaTreasuryAddress: TREASURY_SOL,
      minUsdcMicroUnits: 10_000n,
      nanoTreasuryAddress: TREASURY_NANO,
      minNanoRaw: 10_000_000_000_000_000_000_000_000_000n,
    });

    const mock = makeMockRes();
    let calledNext = false;
    await mw({ headers: {}, originalUrl: '/v1/pools/risk' }, mock.res, () => {
      calledNext = true;
    });

    assert.equal(calledNext, false);
    assert.equal(mock.getStatus(), 402);
    assert.equal(mock.headers['x-payment-protocol'], 'x402-v1');
    const body = mock.getBody() as { x402Version: number; accepts: Array<{ rail: string; payTo: string }> };
    assert.equal(body.x402Version, 1);
    assert.equal(body.accepts.length, 2);
    assert.equal(body.accepts[0].payTo, TREASURY_SOL);
    assert.equal(body.accepts[1].payTo, TREASURY_NANO);
  });

  it('verifies finalized Solana SPL USDC transfer, passes request through, and blocks replay with HTTP 409', async () => {
    const replayStore = new InMemoryX402ReplayStore();
    const mw = createX402SolanaMiddleware({
      resourceDescription: 'Witness Verification Call',
      solanaTreasuryAddress: TREASURY_SOL,
      minUsdcMicroUnits: 50_000n,
      replayStore,
      fetchImpl: async () => makeSolanaTxResponse(),
    });

    const req1: X402RequestLike = {
      headers: { 'x-payment': `solana-usdc:${VALID_SOL_SIG}` },
      originalUrl: '/v1/witness/verify',
    };
    const res1 = makeMockRes();
    let passed = false;
    await mw(req1, res1.res, () => {
      passed = true;
    });

    assert.equal(passed, true);
    assert.equal(req1.x402Payment?.rail, 'solana-usdc');
    assert.equal(req1.x402Payment?.observedBaseUnits, '50000');
    assert.ok(res1.headers['x-payment-response']);

    // Replay with identical Solana tx signature must be rejected with HTTP 409
    const res2 = makeMockRes();
    let passedReplay = false;
    await mw(
      { headers: { 'x-payment': `solana-usdc:${VALID_SOL_SIG}` } },
      res2.res,
      () => {
        passedReplay = true;
      }
    );
    assert.equal(passedReplay, false);
    assert.equal(res2.getStatus(), 409);
  });

  it('verifies Zero-Fee Nano send blocks with RPC failover and rejects underpayments', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const requiredRaw = 10_000_000_000_000_000_000_000_000_000n;
    let attempts = 0;

    const mw = createX402SolanaMiddleware({
      resourceDescription: 'Zero-Fee Agent Telemetry',
      solanaTreasuryAddress: TREASURY_SOL,
      minUsdcMicroUnits: 10_000n,
      nanoTreasuryAddress: TREASURY_NANO,
      minNanoRaw: requiredRaw,
      fetchImpl: async () => {
        attempts += 1;
        if (attempts === 1) return new Response('Unavailable', { status: 503 });
        return new Response(
          JSON.stringify({
            confirmed: 'true',
            subtype: 'send',
            amount: requiredRaw.toString(),
            local_timestamp: String(nowSec - 5),
            contents: { subtype: 'send', link_as_account: TREASURY_NANO },
          }),
          { status: 200 }
        );
      },
    });

    const req: X402RequestLike = {
      headers: {
        'x-payment': Buffer.from(
          JSON.stringify({ rail: 'nano', txHash: VALID_NANO_HASH }),
          'utf8'
        ).toString('base64'),
      },
    };
    const parsed = parseX402PaymentHeader(req);
    assert.equal(parsed?.rail, 'nano');

    const mock = makeMockRes();
    let passed = false;
    await mw(req, mock.res, () => {
      passed = true;
    });
    assert.equal(passed, true);
    assert.equal(attempts, 2);
    assert.equal(req.x402Payment?.rail, 'nano');
  });

  it('validates middleware options and replayStore.claim contract at construction time', () => {
    assert.throws(
      () =>
        createX402SolanaMiddleware({
          resourceDescription: '   ',
          solanaTreasuryAddress: TREASURY_SOL,
          minUsdcMicroUnits: 10_000n,
        }),
      /X402_INVALID_RESOURCE_DESCRIPTION/
    );
    assert.throws(
      () =>
        createX402SolanaMiddleware({
          resourceDescription: 'Feed',
          solanaTreasuryAddress: 'not-base58!',
          minUsdcMicroUnits: 10_000n,
        }),
      /X402_INVALID_SOLANA_TREASURY/
    );
    assert.throws(
      () =>
        createX402SolanaMiddleware({
          resourceDescription: 'Feed',
          solanaTreasuryAddress: TREASURY_SOL,
          minUsdcMicroUnits: 0n,
        }),
      /X402_INVALID_MIN_USDC/
    );
    assert.throws(
      () =>
        createX402SolanaMiddleware({
          resourceDescription: 'Feed',
          solanaTreasuryAddress: TREASURY_SOL,
          minUsdcMicroUnits: 10_000n,
          nanoTreasuryAddress: 'nano_bad',
          minNanoRaw: 1n,
        }),
      /X402_INVALID_NANO_CONFIG/
    );
    assert.throws(
      () =>
        createX402SolanaMiddleware({
          resourceDescription: 'Feed',
          solanaTreasuryAddress: TREASURY_SOL,
          minUsdcMicroUnits: 10_000n,
          maxTxAgeSeconds: -1,
        }),
      /X402_INVALID_MAX_TX_AGE/
    );
    assert.throws(
      () =>
        createX402SolanaMiddleware({
          resourceDescription: 'Feed',
          solanaTreasuryAddress: TREASURY_SOL,
          minUsdcMicroUnits: 10_000n,
          solanaRpcUrl: 'ftp://invalid.rpc',
        }),
      /X402_INVALID_SOLANA_RPC_URL/
    );
    assert.throws(
      () =>
        createX402SolanaMiddleware({
          resourceDescription: 'Feed',
          solanaTreasuryAddress: TREASURY_SOL,
          minUsdcMicroUnits: 10_000n,
          replayStore: { has: () => false } as never,
        }),
      /X402_REPLAY_STORE_MISSING_CLAIM/
    );
    assert.throws(() => new InMemoryX402ReplayStore({ maxEntries: 0 }), /INVALID_REPLAY_STORE_MAX_ENTRIES/);
  });

  it('bounds InMemoryX402ReplayStore capacity and prevents concurrent TOCTOU double-spend races', async () => {
    const bounded = new InMemoryX402ReplayStore({ maxEntries: 2 });
    assert.equal(bounded.claim('k1'), true);
    assert.equal(bounded.claim('k1'), false);
    assert.equal(bounded.claim('k2'), true);
    assert.equal(bounded.claim('k3'), true);
    assert.equal(bounded.has('k1'), false);
    assert.equal(bounded.has('k2'), true);
    assert.equal(bounded.has('k3'), true);

    const mw = createX402SolanaMiddleware({
      resourceDescription: 'Concurrent Race Test',
      solanaTreasuryAddress: TREASURY_SOL,
      minUsdcMicroUnits: 50_000n,
      fetchImpl: async () => {
        await new Promise((r) => setTimeout(r, 25));
        return makeSolanaTxResponse();
      },
    });

    const r1 = makeMockRes();
    const r2 = makeMockRes();
    let next1 = false;
    let next2 = false;
    await Promise.all([
      mw({ headers: { 'x-payment': `solana-usdc:${VALID_SOL_SIG}` } }, r1.res, () => {
        next1 = true;
      }),
      mw({ headers: { 'x-payment': `solana-usdc:${VALID_SOL_SIG}` } }, r2.res, () => {
        next2 = true;
      }),
    ]);

    assert.equal(Number(next1) + Number(next2), 1);
    const loserStatus = next1 ? r2.getStatus() : r1.getStatus();
    assert.equal(loserStatus, 409);
  });

  it('preserves Base58 case for Solana signatures while lowercasing Nano hashes', () => {
    const mixedCase = '5VERv8NMvzbJMEdV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUc';
    const flipped = mixedCase.toLowerCase();
    assert.equal(canonicalizeReplayTxHash('solana-usdc', ` ${mixedCase} `), mixedCase);
    assert.notEqual(
      canonicalizeReplayTxHash('solana-usdc', mixedCase),
      canonicalizeReplayTxHash('solana-usdc', flipped)
    );
    assert.equal(canonicalizeReplayTxHash('nano', ` ${'AB'.repeat(32)} `), 'ab'.repeat(32));
  });

  it('rejects Solana responses missing slot, missing blockTime, malformed BigInt, or lacking spl-token instruction', async () => {
    const missingSlotMw = createX402SolanaMiddleware({
      resourceDescription: 'Slot Check',
      solanaTreasuryAddress: TREASURY_SOL,
      minUsdcMicroUnits: 50_000n,
      fetchImpl: async () => makeSolanaTxResponse({ slot: null }),
    });
    const resSlot = makeMockRes();
    await missingSlotMw({ headers: { 'x-payment': `solana-usdc:${VALID_SOL_SIG}` } }, resSlot.res, () => {});
    assert.equal(resSlot.getStatus(), 502);
    assert.equal((resSlot.getBody() as { error: string }).error, 'INCOMPLETE_RPC_EVIDENCE');

    const missingTsMw = createX402SolanaMiddleware({
      resourceDescription: 'Timestamp Check',
      solanaTreasuryAddress: TREASURY_SOL,
      minUsdcMicroUnits: 50_000n,
      fetchImpl: async () => makeSolanaTxResponse({ blockTime: null }),
    });
    const resTs = makeMockRes();
    await missingTsMw({ headers: { 'x-payment': `solana-usdc:${VALID_SOL_SIG}` } }, resTs.res, () => {});
    assert.equal(resTs.getStatus(), 422);
    assert.equal((resTs.getBody() as { error: string }).error, 'TX_TIMESTAMP_UNAVAILABLE');

    const malformedBigIntMw = createX402SolanaMiddleware({
      resourceDescription: 'Malformed BigInt Check',
      solanaTreasuryAddress: TREASURY_SOL,
      minUsdcMicroUnits: 50_000n,
      fetchImpl: async () => makeSolanaTxResponse({ postAmount: 'not-a-number' }),
    });
    const resBig = makeMockRes();
    await malformedBigIntMw({ headers: { 'x-payment': `solana-usdc:${VALID_SOL_SIG}` } }, resBig.res, () => {});
    assert.equal(resBig.getStatus(), 502);
    assert.equal((resBig.getBody() as { error: string }).error, 'MALFORMED_RPC_RESPONSE');

    const noInstructionMw = createX402SolanaMiddleware({
      resourceDescription: 'Instruction Cross-Check',
      solanaTreasuryAddress: TREASURY_SOL,
      minUsdcMicroUnits: 50_000n,
      fetchImpl: async () => makeSolanaTxResponse({ includeIx: false }),
    });
    const resNoIx = makeMockRes();
    await noInstructionMw({ headers: { 'x-payment': `solana-usdc:${VALID_SOL_SIG}` } }, resNoIx.res, () => {});
    assert.equal(resNoIx.getStatus(), 422);
    assert.equal((resNoIx.getBody() as { error: string }).error, 'INSUFFICIENT_PAYMENT_AMOUNT');

    const wrongMintIxMw = createX402SolanaMiddleware({
      resourceDescription: 'Mint Cross-Check',
      solanaTreasuryAddress: TREASURY_SOL,
      minUsdcMicroUnits: 50_000n,
      fetchImpl: async () =>
        makeSolanaTxResponse({ ixMint: 'So11111111111111111111111111111111111111112' }),
    });
    const resWrongMint = makeMockRes();
    await wrongMintIxMw({ headers: { 'x-payment': `solana-usdc:${VALID_SOL_SIG}` } }, resWrongMint.res, () => {});
    assert.equal(resWrongMint.getStatus(), 422);
    assert.equal((resWrongMint.getBody() as { error: string }).error, 'INSUFFICIENT_PAYMENT_AMOUNT');
  });

  it('preserves 502 NANO_RPC_UNAVAILABLE on mixed node failure and rejects missing Nano timestamp/malformed amount', async () => {
    const requiredRaw = 10_000_000_000_000_000_000_000_000_000n;
    let callIdx = 0;
    const mixedFailMw = createX402SolanaMiddleware({
      resourceDescription: 'Nano Failover Check',
      solanaTreasuryAddress: TREASURY_SOL,
      minUsdcMicroUnits: 10_000n,
      nanoTreasuryAddress: TREASURY_NANO,
      minNanoRaw: requiredRaw,
      nanoRpcUrls: ['https://node1.example', 'https://node2.example'],
      fetchImpl: async () => {
        callIdx += 1;
        if (callIdx === 1) {
          return new Response(JSON.stringify({ error: 'Block not found' }), { status: 200 });
        }
        return new Response('Service Unavailable', { status: 503 });
      },
    });
    const resMixed = makeMockRes();
    await mixedFailMw({ headers: { 'x-payment': `nano:${VALID_NANO_HASH}` } }, resMixed.res, () => {});
    assert.equal(resMixed.getStatus(), 502);
    assert.equal((resMixed.getBody() as { error: string }).error, 'NANO_RPC_UNAVAILABLE');

    const missingTsMw = createX402SolanaMiddleware({
      resourceDescription: 'Nano Missing TS',
      solanaTreasuryAddress: TREASURY_SOL,
      minUsdcMicroUnits: 10_000n,
      nanoTreasuryAddress: TREASURY_NANO,
      minNanoRaw: requiredRaw,
      nanoRpcUrls: ['https://node1.example'],
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            confirmed: 'true',
            subtype: 'send',
            amount: requiredRaw.toString(),
            local_timestamp: '0',
            contents: { subtype: 'send', link_as_account: TREASURY_NANO },
          }),
          { status: 200 }
        ),
    });
    const resTs = makeMockRes();
    await missingTsMw({ headers: { 'x-payment': `nano:${VALID_NANO_HASH}` } }, resTs.res, () => {});
    assert.equal(resTs.getStatus(), 422);
    assert.equal((resTs.getBody() as { error: string }).error, 'TX_TIMESTAMP_UNAVAILABLE');

    const badAmtMw = createX402SolanaMiddleware({
      resourceDescription: 'Nano Bad Amount',
      solanaTreasuryAddress: TREASURY_SOL,
      minUsdcMicroUnits: 10_000n,
      nanoTreasuryAddress: TREASURY_NANO,
      minNanoRaw: requiredRaw,
      nanoRpcUrls: ['https://node1.example'],
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            confirmed: 'true',
            subtype: 'send',
            amount: 'NaN',
            local_timestamp: String(Math.floor(Date.now() / 1000)),
            contents: { subtype: 'send', link_as_account: TREASURY_NANO },
          }),
          { status: 200 }
        ),
    });
    const resAmt = makeMockRes();
    await badAmtMw({ headers: { 'x-payment': `nano:${VALID_NANO_HASH}` } }, resAmt.res, () => {});
    assert.equal(resAmt.getStatus(), 502);
    assert.equal((resAmt.getBody() as { error: string }).error, 'MALFORMED_RPC_RESPONSE');
  });

  it('returns 500 BYPASS_CHECK_FAILED and 503 REPLAY_STORE_UNAVAILABLE when callbacks throw', async () => {
    const bypassThrowMw = createX402SolanaMiddleware({
      resourceDescription: 'Bypass Error',
      solanaTreasuryAddress: TREASURY_SOL,
      minUsdcMicroUnits: 10_000n,
      allowBypass: async () => {
        throw new Error('auth down');
      },
    });
    const resBypass = makeMockRes();
    let calledNext = false;
    await bypassThrowMw({ headers: {} }, resBypass.res, () => {
      calledNext = true;
    });
    assert.equal(calledNext, false);
    assert.equal(resBypass.getStatus(), 500);
    assert.equal((resBypass.getBody() as { error: string }).error, 'BYPASS_CHECK_FAILED');

    const storeThrowMw = createX402SolanaMiddleware({
      resourceDescription: 'Store Error',
      solanaTreasuryAddress: TREASURY_SOL,
      minUsdcMicroUnits: 10_000n,
      replayStore: {
        has: async () => {
          throw new Error('redis down');
        },
        claim: async () => true,
      },
    });
    const resStore = makeMockRes();
    await storeThrowMw({ headers: { 'x-payment': `solana-usdc:${VALID_SOL_SIG}` } }, resStore.res, () => {});
    assert.equal(resStore.getStatus(), 503);
    assert.equal((resStore.getBody() as { error: string }).error, 'REPLAY_STORE_UNAVAILABLE');
  });
});
