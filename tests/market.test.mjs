import test from 'node:test';
import assert from 'node:assert/strict';
import { getMarketObservations } from '../examples/market.mjs';
import { checkFile } from '../scripts/check-public-boundary.mjs';

test('Publication boundary refuses source, environment files, symlinks and credential patterns', () => {
  assert.throws(() => checkFile('src/App.tsx', 'site implementation'), /Unreviewed/);
  assert.throws(() => checkFile('.env', 'value'), /Unreviewed/);
  assert.throws(() => checkFile('README.md', 'link', true), /Unreviewed/);
  assert.throws(() => checkFile('README.md', 'ghp_' + 'x'.repeat(36)), /Possible credential/);
});

test('Provider failure is reported without fabricated fallback data', async () => {
  await assert.rejects(getMarketObservations(async () => new Response('', { status: 503 })), /unavailable/);
});
test('Client reads only the documented public endpoint and retains original quote units', async () => {
  const result = await getMarketObservations(async (url, options) => {
    assert.equal(url, 'https://www.moltalpha.dev/api/market-intelligence');
    assert.equal(options.method, undefined);
    assert.equal(options.headers.Authorization, undefined);
    return Response.json({ mode: 'LIVE_OBSERVATIONS_ONLY', markets: [{ pair: 'XSOL/XMD', quote: 'XMD' }] });
  });
  assert.equal(result.markets[0].quote, 'XMD');
});
