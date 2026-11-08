import { pathToFileURL } from 'node:url';

export async function getMarketObservations(request = fetch) {
  const response = await request('https://www.moltalpha.dev/api/market-intelligence', {
    headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`Market source unavailable (HTTP ${response.status}).`);
  const result = await response.json();
  if (result.mode !== 'LIVE_OBSERVATIONS_ONLY' || !Array.isArray(result.markets)) throw new Error('Unsupported market response.');
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await getMarketObservations();
    console.log(JSON.stringify({ retrievedAt: result.generatedAtIso, providers: result.providers, markets: result.markets }, null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
