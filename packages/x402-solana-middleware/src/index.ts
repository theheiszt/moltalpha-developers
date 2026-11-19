export const SOLANA_MAINNET_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const DEFAULT_SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
export const DEFAULT_NANO_RPC_URLS = [
  'https://rpc.nano.to',
  'https://uk1.public.xnopay.com/proxy',
  'https://rainstorm.city/api',
] as const;

const SOLANA_TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const SOLANA_TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const NANO_ADDRESS_REGEX = /^nano_[13][13456789abcdefghijkmnopqrstuwxyz]{59}$/;
const SOLANA_SIG_REGEX = /^[1-9A-HJ-NP-Za-km-z]{80,90}$/;
const NANO_HASH_REGEX = /^[0-9a-fA-F]{64}$/;

export type X402Rail = 'solana-usdc' | 'nano';

export interface X402ReplayStore {
  has(key: string): boolean | Promise<boolean>;
  /** Atomically reserves `key` if absent. Returns `true` if claimed, `false` if already redeemed. */
  claim(key: string): boolean | Promise<boolean>;
  /** @deprecated Use atomic `claim(key)` instead. */
  add?(key: string): void | Promise<void>;
}

export class InMemoryX402ReplayStore implements X402ReplayStore {
  private readonly seen = new Set<string>();
  private readonly maxEntries: number;

  constructor(options?: { maxEntries?: number }) {
    const max = options?.maxEntries ?? 100_000;
    if (!Number.isInteger(max) || max < 1) {
      throw new Error('INVALID_REPLAY_STORE_MAX_ENTRIES');
    }
    this.maxEntries = max;
  }

  has(key: string): boolean {
    return this.seen.has(key);
  }

  claim(key: string): boolean {
    if (this.seen.has(key)) return false;
    if (this.seen.size >= this.maxEntries) {
      const oldest = this.seen.values().next().value;
      if (oldest !== undefined) this.seen.delete(oldest);
    }
    this.seen.add(key);
    return true;
  }

  add(key: string): void {
    this.claim(key);
  }
}

export interface X402MiddlewareOptions {
  /** Human-readable resource description returned inside the HTTP 402 challenge. */
  resourceDescription: string;
  /** Solana Mainnet treasury wallet receiving SPL USDC transfers. */
  solanaTreasuryAddress: string;
  /** Minimum SPL USDC transfer in micro-USDC (6 decimals; e.g., 10_000n = $0.01 USDC). */
  minUsdcMicroUnits: bigint;
  /** Optional SPL mint override (defaults to Solana Mainnet USDC). */
  usdcMintAddress?: string;
  /** Optional Nano (XNO) receiving treasury address for zero-fee settlement. */
  nanoTreasuryAddress?: string;
  /** Minimum Nano transfer in raw (30 decimals; required if nanoTreasuryAddress is set). */
  minNanoRaw?: bigint;
  /** Optional Solana RPC URL override. */
  solanaRpcUrl?: string;
  /** Optional Nano RPC failover URL list. */
  nanoRpcUrls?: readonly string[];
  /** Optional maximum transaction age in seconds (default 900s = 15 minutes). */
  maxTxAgeSeconds?: number;
  /** Allow transactions lacking on-chain blockTime/local_timestamp (defaults to false, fail closed). */
  allowMissingTxTimestamp?: boolean;
  /** Replay ledger preventing the same on-chain tx hash from paying for two requests. */
  replayStore?: X402ReplayStore;
  /** Custom fetch implementation for testing or proxying. */
  fetchImpl?: typeof fetch;
  /** Optional bypass callback (e.g., if caller already authenticated with a paid API key). */
  allowBypass?: (req: X402RequestLike) => boolean | Promise<boolean>;
}

export interface X402RequestLike {
  headers: Record<string, string | string[] | undefined>;
  method?: string;
  originalUrl?: string;
  url?: string;
  x402Payment?: X402VerifiedPayment;
}

export interface X402ResponseLike {
  status(code: number): X402ResponseLike;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
}

export interface X402VerifiedPayment {
  rail: X402Rail;
  txHash: string;
  observedBaseUnits: string;
  recipient: string;
  verifiedAtIso: string;
}

export interface X402PaymentHeader {
  rail: X402Rail;
  txHash: string;
}

export function canonicalizeReplayTxHash(rail: X402Rail, txHash: string): string {
  const trimmed = txHash.trim();
  return rail === 'nano' ? trimmed.toLowerCase() : trimmed; // Solana Base58 is case-sensitive
}

function parseNonNegativeBigInt(raw: unknown): bigint | null {
  if (typeof raw === 'bigint') return raw >= 0n ? raw : null;
  if (typeof raw === 'number') {
    return Number.isSafeInteger(raw) && raw >= 0 ? BigInt(raw) : null;
  }
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) {
    try {
      return BigInt(raw.trim());
    } catch {
      return null;
    }
  }
  return null;
}

function validateMiddlewareOptions(options: X402MiddlewareOptions): void {
  if (!options || typeof options !== 'object') {
    throw new Error('X402_INVALID_OPTIONS');
  }
  if (typeof options.resourceDescription !== 'string' || options.resourceDescription.trim().length === 0) {
    throw new Error('X402_INVALID_RESOURCE_DESCRIPTION');
  }
  if (typeof options.solanaTreasuryAddress !== 'string' || !SOLANA_ADDRESS_REGEX.test(options.solanaTreasuryAddress)) {
    throw new Error('X402_INVALID_SOLANA_TREASURY');
  }
  if (typeof options.minUsdcMicroUnits !== 'bigint' || options.minUsdcMicroUnits <= 0n) {
    throw new Error('X402_INVALID_MIN_USDC');
  }
  if (
    options.usdcMintAddress !== undefined &&
    (typeof options.usdcMintAddress !== 'string' || !SOLANA_ADDRESS_REGEX.test(options.usdcMintAddress))
  ) {
    throw new Error('X402_INVALID_USDC_MINT');
  }
  if (options.nanoTreasuryAddress !== undefined) {
    if (
      typeof options.nanoTreasuryAddress !== 'string' ||
      !NANO_ADDRESS_REGEX.test(options.nanoTreasuryAddress) ||
      typeof options.minNanoRaw !== 'bigint' ||
      options.minNanoRaw <= 0n
    ) {
      throw new Error('X402_INVALID_NANO_CONFIG');
    }
  }
  if (options.minNanoRaw !== undefined) {
    if (
      typeof options.minNanoRaw !== 'bigint' ||
      options.minNanoRaw <= 0n ||
      !options.nanoTreasuryAddress
    ) {
      throw new Error('X402_INVALID_NANO_CONFIG');
    }
  }
  if (
    options.maxTxAgeSeconds !== undefined &&
    (typeof options.maxTxAgeSeconds !== 'number' ||
      !Number.isFinite(options.maxTxAgeSeconds) ||
      options.maxTxAgeSeconds <= 0)
  ) {
    throw new Error('X402_INVALID_MAX_TX_AGE');
  }
  if (
    options.solanaRpcUrl !== undefined &&
    (typeof options.solanaRpcUrl !== 'string' || !/^https?:\/\//i.test(options.solanaRpcUrl))
  ) {
    throw new Error('X402_INVALID_SOLANA_RPC_URL');
  }
  if (
    options.nanoRpcUrls !== undefined &&
    (!Array.isArray(options.nanoRpcUrls) ||
      options.nanoRpcUrls.length === 0 ||
      !options.nanoRpcUrls.every((u) => typeof u === 'string' && /^https?:\/\//i.test(u)))
  ) {
    throw new Error('X402_INVALID_NANO_RPC_URLS');
  }
}

function readHeader(req: X402RequestLike, name: string): string | null {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(req.headers || {})) {
    if (k.toLowerCase() === lower) {
      if (Array.isArray(v)) return v[0]?.trim() || null;
      return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
    }
  }
  return null;
}

/**
 * Parses `X-Payment` header in either structured JSON/base64 JSON (`{"rail":"solana-usdc","txHash":"..."}`)
 * or compact `rail:txHash` format (`solana-usdc:<sig>` or `nano:<hash>`).
 */
export function parseX402PaymentHeader(req: X402RequestLike): X402PaymentHeader | null {
  const raw = readHeader(req, 'x-payment') || readHeader(req, 'x-payment-tx');
  if (!raw) return null;

  // Compact syntax: "solana-usdc:<base58sig>" or "nano:<64hex>"
  const colonIdx = raw.indexOf(':');
  if (colonIdx > 0 && !raw.startsWith('{')) {
    const railPart = raw.slice(0, colonIdx).trim().toLowerCase();
    const txHash = raw.slice(colonIdx + 1).trim();
    if ((railPart === 'solana-usdc' || railPart === 'nano') && txHash.length > 0) {
      return { rail: railPart, txHash };
    }
  }

  // Raw JSON or Base64-encoded JSON
  for (const candidate of [raw, Buffer.from(raw, 'base64').toString('utf8')]) {
    try {
      const parsed = JSON.parse(candidate) as { rail?: string; txHash?: string; tx_hash?: string };
      const rail = String(parsed.rail || '').toLowerCase();
      const txHash = String(parsed.txHash || parsed.tx_hash || '').trim();
      if ((rail === 'solana-usdc' || rail === 'nano') && txHash.length > 0) {
        return { rail, txHash };
      }
    } catch {
      // try next format
    }
  }

  return null;
}

export function buildX402ChallengePayload(options: X402MiddlewareOptions, resourcePath: string) {
  const accepts: Array<Record<string, string>> = [
    {
      scheme: 'exact',
      network: 'solana-mainnet-beta',
      rail: 'solana-usdc',
      asset: options.usdcMintAddress || SOLANA_MAINNET_USDC_MINT,
      assetSymbol: 'USDC',
      payTo: options.solanaTreasuryAddress,
      maxAmountRequired: options.minUsdcMicroUnits.toString(),
      decimals: '6',
    },
  ];

  if (options.nanoTreasuryAddress && options.minNanoRaw && options.minNanoRaw > 0n) {
    accepts.push({
      scheme: 'exact',
      network: 'nano-mainnet',
      rail: 'nano',
      asset: 'XNO',
      assetSymbol: 'XNO',
      payTo: options.nanoTreasuryAddress,
      maxAmountRequired: options.minNanoRaw.toString(),
      decimals: '30',
    });
  }

  return {
    x402Version: 1,
    error: 'PAYMENT_REQUIRED',
    message: `Payment required to access ${options.resourceDescription}. Retry with header X-Payment: <rail>:<txHash>.`,
    resource: resourcePath,
    accepts,
    docsUrl: 'https://www.moltalpha.dev/docs/errors#PAYMENT_REQUIRED',
  };
}

interface SolanaParsedInstruction {
  program?: string;
  programId?: string;
  parsed?: {
    type?: string;
    info?: Record<string, unknown>;
  };
}

interface SolanaTokenBalanceRow {
  accountIndex?: number;
  owner?: string;
  mint?: string;
  uiTokenAmount?: { amount?: unknown };
}

async function verifySolanaUsdcPayment(
  txHash: string,
  options: X402MiddlewareOptions,
  fetcher: typeof fetch
): Promise<{ ok: true; observed: bigint } | { ok: false; status: number; code: string; message: string }> {
  if (!SOLANA_SIG_REGEX.test(txHash)) {
    return { ok: false, status: 400, code: 'INVALID_TX_HASH', message: 'Malformed Solana transaction signature.' };
  }

  const rpcUrl = options.solanaRpcUrl || DEFAULT_SOLANA_RPC_URL;
  const mint = options.usdcMintAddress || SOLANA_MAINNET_USDC_MINT;
  const maxAgeSec = options.maxTxAgeSeconds ?? 900;

  let tx: {
    slot?: number | null;
    blockTime?: number | null;
    transaction?: {
      message?: {
        accountKeys?: Array<string | { pubkey?: string }>;
        instructions?: SolanaParsedInstruction[];
      };
    };
    meta?: {
      err?: unknown;
      innerInstructions?: Array<{ instructions?: SolanaParsedInstruction[] }>;
      preTokenBalances?: SolanaTokenBalanceRow[];
      postTokenBalances?: SolanaTokenBalanceRow[];
    };
  } | null;

  try {
    const res = await fetcher(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTransaction',
        params: [txHash, { encoding: 'jsonParsed', commitment: 'finalized', maxSupportedTransactionVersion: 0 }],
      }),
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) {
      return { ok: false, status: 502, code: 'SOLANA_RPC_UNAVAILABLE', message: `Solana RPC HTTP ${res.status}` };
    }
    const body = (await res.json()) as { result?: typeof tx };
    tx = body.result ?? null;
  } catch {
    return { ok: false, status: 502, code: 'SOLANA_RPC_UNAVAILABLE', message: 'Unable to reach Solana RPC node.' };
  }

  if (!tx || !tx.meta) {
    return { ok: false, status: 404, code: 'TX_NOT_FINALIZED', message: 'Solana transaction not found or not finalized.' };
  }
  if (typeof tx.slot !== 'number' || !Number.isFinite(tx.slot) || tx.slot <= 0) {
    return {
      ok: false,
      status: 502,
      code: 'INCOMPLETE_RPC_EVIDENCE',
      message: 'Incomplete Solana RPC transaction metadata (missing finalized slot).',
    };
  }
  if (tx.meta.err !== null && tx.meta.err !== undefined) {
    return { ok: false, status: 422, code: 'ONCHAIN_TX_FAILED', message: 'Solana transaction failed on-chain.' };
  }
  if (typeof tx.blockTime === 'number' && Number.isFinite(tx.blockTime) && tx.blockTime > 0) {
    const ageSec = Math.floor(Date.now() / 1000) - tx.blockTime;
    if (ageSec > maxAgeSec || ageSec < -300) {
      return { ok: false, status: 422, code: 'TX_EXPIRED', message: `Solana transaction outside ${maxAgeSec}s freshness window.` };
    }
  } else if (!options.allowMissingTxTimestamp) {
    return {
      ok: false,
      status: 422,
      code: 'TX_TIMESTAMP_UNAVAILABLE',
      message: 'Solana transaction blockTime is missing; cannot verify freshness.',
    };
  }

  const accountKeys = (tx.transaction?.message?.accountKeys || []).map((k) =>
    typeof k === 'string' ? k : String(k?.pubkey || '')
  );
  const preBalances = tx.meta.preTokenBalances || [];
  const postBalances = tx.meta.postTokenBalances || [];
  const treasuryAccounts = new Set<string>([options.solanaTreasuryAddress]);
  const treasuryIndices = new Set<number>();

  for (const row of postBalances) {
    if (row.owner === options.solanaTreasuryAddress && row.mint === mint && typeof row.accountIndex === 'number') {
      treasuryIndices.add(row.accountIndex);
      const pubkey = accountKeys[row.accountIndex];
      if (pubkey) treasuryAccounts.add(pubkey);
    }
  }

  const preMap = new Map<number, bigint>();
  for (const row of preBalances) {
    if (row.mint === mint && typeof row.accountIndex === 'number' && treasuryIndices.has(row.accountIndex)) {
      const parsed = parseNonNegativeBigInt(row.uiTokenAmount?.amount ?? '0');
      if (parsed === null) {
        return {
          ok: false,
          status: 502,
          code: 'MALFORMED_RPC_RESPONSE',
          message: 'Solana RPC returned malformed preTokenBalances amount.',
        };
      }
      preMap.set(row.accountIndex, parsed);
    }
  }

  let netDelta = 0n;
  for (const row of postBalances) {
    if (row.mint === mint && typeof row.accountIndex === 'number' && treasuryIndices.has(row.accountIndex)) {
      const parsed = parseNonNegativeBigInt(row.uiTokenAmount?.amount);
      if (parsed === null) {
        return {
          ok: false,
          status: 502,
          code: 'MALFORMED_RPC_RESPONSE',
          message: 'Solana RPC returned malformed postTokenBalances amount.',
        };
      }
      const pre = preMap.get(row.accountIndex) ?? 0n;
      if (parsed > pre) {
        netDelta += parsed - pre;
      }
    }
  }

  const topLevel = tx.transaction?.message?.instructions || [];
  const inner = (tx.meta.innerInstructions || []).flatMap((g) => g.instructions || []);
  const allIxs = [...topLevel, ...inner];

  let transferred = 0n;
  for (const ix of allIxs) {
    const isSplToken =
      ix.program === 'spl-token' ||
      ix.programId === SOLANA_TOKEN_PROGRAM_ID ||
      ix.programId === SOLANA_TOKEN_2022_PROGRAM_ID;
    if (!isSplToken) continue;
    const type = ix.parsed?.type;
    const info = ix.parsed?.info || {};
    const dest = typeof info.destination === 'string' ? info.destination : '';
    if (!treasuryAccounts.has(dest)) continue;

    if (type === 'transferChecked') {
      if (info.mint !== mint) continue;
      const rawAmt = (info.tokenAmount as { amount?: unknown } | undefined)?.amount;
      const amt = parseNonNegativeBigInt(rawAmt);
      if (amt === null) {
        return {
          ok: false,
          status: 502,
          code: 'MALFORMED_RPC_RESPONSE',
          message: 'Solana RPC returned malformed transferChecked amount.',
        };
      }
      if (amt > 0n) transferred += amt;
    } else if (type === 'transfer') {
      if (dest === options.solanaTreasuryAddress || treasuryIndices.size === 0) continue;
      const amt = parseNonNegativeBigInt(info.amount);
      if (amt === null) {
        return {
          ok: false,
          status: 502,
          code: 'MALFORMED_RPC_RESPONSE',
          message: 'Solana RPC returned malformed transfer amount.',
        };
      }
      if (amt > 0n) transferred += amt;
    }
  }

  const observed = netDelta < transferred ? netDelta : transferred;
  if (observed < options.minUsdcMicroUnits) {
    return {
      ok: false,
      status: 422,
      code: 'INSUFFICIENT_PAYMENT_AMOUNT',
      message: `Observed SPL USDC delta (${observed}) is below required ${options.minUsdcMicroUnits} micro-USDC.`,
    };
  }
  return { ok: true, observed };
}

async function verifyNanoPayment(
  txHash: string,
  options: X402MiddlewareOptions,
  fetcher: typeof fetch
): Promise<{ ok: true; observed: bigint } | { ok: false; status: number; code: string; message: string }> {
  if (!options.nanoTreasuryAddress || !options.minNanoRaw || options.minNanoRaw <= 0n) {
    return { ok: false, status: 400, code: 'NANO_RAIL_DISABLED', message: 'Nano rail is not enabled on this endpoint.' };
  }
  if (!NANO_HASH_REGEX.test(txHash)) {
    return { ok: false, status: 400, code: 'INVALID_TX_HASH', message: 'Malformed 64-char Nano block hash.' };
  }

  const rpcUrls = options.nanoRpcUrls && options.nanoRpcUrls.length > 0 ? options.nanoRpcUrls : DEFAULT_NANO_RPC_URLS;
  const maxAgeSec = options.maxTxAgeSeconds ?? 900;
  interface NanoBlockInfoResponse {
    error?: string;
    confirmed?: string | boolean;
    subtype?: string;
    amount?: unknown;
    local_timestamp?: string | number;
    contents?: { subtype?: string; link_as_account?: string };
  }

  let validInfo: NanoBlockInfoResponse | null = null;
  let lastBlockError: string | null = null;
  let hadTransportOrHttpError = false;

  for (const url of rpcUrls) {
    try {
      const res = await fetcher(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'block_info', json_block: 'true', hash: txHash.toUpperCase() }),
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) {
        hadTransportOrHttpError = true;
        continue;
      }
      const parsed = (await res.json()) as NanoBlockInfoResponse;
      if (parsed && !parsed.error) {
        validInfo = parsed;
        break;
      }
      lastBlockError = parsed?.error ? String(parsed.error) : 'Unknown Nano RPC error';
    } catch {
      hadTransportOrHttpError = true;
      continue;
    }
  }

  if (!validInfo) {
    if (lastBlockError && !hadTransportOrHttpError) {
      return { ok: false, status: 404, code: 'TX_NOT_FOUND', message: `Nano block not found: ${lastBlockError}` };
    }
    return { ok: false, status: 502, code: 'NANO_RPC_UNAVAILABLE', message: 'Unable to reach Nano RPC nodes.' };
  }

  if (validInfo.confirmed !== true && validInfo.confirmed !== 'true') {
    return { ok: false, status: 422, code: 'TX_UNCONFIRMED', message: 'Nano send block is not yet confirmed.' };
  }
  const subtype = validInfo.subtype || validInfo.contents?.subtype;
  if (subtype !== 'send') {
    return { ok: false, status: 422, code: 'INVALID_NANO_SUBTYPE', message: 'Nano block must be a confirmed send block.' };
  }
  if (validInfo.contents?.link_as_account !== options.nanoTreasuryAddress) {
    return { ok: false, status: 422, code: 'WRONG_RECIPIENT', message: 'Nano send block recipient does not match treasury.' };
  }

  const rawTs = validInfo.local_timestamp;
  const localTs = rawTs !== undefined && rawTs !== null && String(rawTs).trim() !== '' ? Number(rawTs) : NaN;
  if (Number.isFinite(localTs) && localTs > 0) {
    const ageSec = Math.floor(Date.now() / 1000) - localTs;
    if (ageSec > maxAgeSec || ageSec < -300) {
      return { ok: false, status: 422, code: 'TX_EXPIRED', message: `Nano block outside ${maxAgeSec}s freshness window.` };
    }
  } else if (!options.allowMissingTxTimestamp) {
    return {
      ok: false,
      status: 422,
      code: 'TX_TIMESTAMP_UNAVAILABLE',
      message: 'Nano block local_timestamp is missing; cannot verify freshness.',
    };
  }

  const observed = parseNonNegativeBigInt(validInfo.amount);
  if (observed === null) {
    return {
      ok: false,
      status: 502,
      code: 'MALFORMED_RPC_RESPONSE',
      message: 'Nano RPC returned missing or malformed raw amount.',
    };
  }
  if (observed < options.minNanoRaw) {
    return {
      ok: false,
      status: 422,
      code: 'INSUFFICIENT_PAYMENT_AMOUNT',
      message: `Observed Nano amount (${observed}) is below required ${options.minNanoRaw} raw.`,
    };
  }
  return { ok: true, observed };
}

let warnedInMemoryProductionStore = false;

/**
 * Express-compatible HTTP 402 (x402) pay-per-call middleware for autonomous AI agents.
 * Issues a machine-readable HTTP 402 challenge when unpaid, verifies finalized Solana SPL USDC
 * or confirmed Zero-Fee Nano send blocks on-chain, and enforces atomic replay protection.
 */
export function createX402SolanaMiddleware(options: X402MiddlewareOptions) {
  validateMiddlewareOptions(options);

  if (options.replayStore && typeof options.replayStore.claim !== 'function') {
    throw new Error('X402_REPLAY_STORE_MISSING_CLAIM');
  }

  if (
    !options.replayStore &&
    !warnedInMemoryProductionStore &&
    typeof process !== 'undefined' &&
    process.env?.NODE_ENV === 'production'
  ) {
    warnedInMemoryProductionStore = true;
    console.warn(
      '[x402-solana-middleware] Using single-instance InMemoryX402ReplayStore in production; pass a shared atomic X402ReplayStore (Redis/Postgres/Firestore).'
    );
  }

  const replayStore = options.replayStore || new InMemoryX402ReplayStore();
  const fetcher = options.fetchImpl || fetch;

  return async function x402Middleware(
    req: X402RequestLike,
    res: X402ResponseLike,
    next: () => void
  ): Promise<void> {
    if (options.allowBypass) {
      try {
        if (await options.allowBypass(req)) {
          next();
          return;
        }
      } catch {
        res.status(500).json({
          error: 'BYPASS_CHECK_FAILED',
          message: 'Authorization bypass check failed.',
        });
        return;
      }
    }

    const resourcePath = req.originalUrl || req.url || '/';
    const paymentHeader = parseX402PaymentHeader(req);
    if (!paymentHeader) {
      res.setHeader('X-Payment-Protocol', 'x402-v1');
      res.status(402).json(buildX402ChallengePayload(options, resourcePath));
      return;
    }

    const canonicalTx = canonicalizeReplayTxHash(paymentHeader.rail, paymentHeader.txHash);
    const replayKey = `${paymentHeader.rail}:${canonicalTx}`;

    try {
      if (await replayStore.has(replayKey)) {
        res.status(409).json({
          error: 'PAYMENT_REPLAY_DETECTED',
          message: 'This on-chain transaction has already been redeemed for an x402 request.',
        });
        return;
      }
    } catch {
      res.status(503).json({
        error: 'REPLAY_STORE_UNAVAILABLE',
        message: 'Replay ledger unavailable.',
      });
      return;
    }

    const verified =
      paymentHeader.rail === 'solana-usdc'
        ? await verifySolanaUsdcPayment(canonicalTx, options, fetcher)
        : await verifyNanoPayment(canonicalTx, options, fetcher);

    if (!verified.ok) {
      res.status(verified.status).json({
        error: verified.code,
        message: verified.message,
      });
      return;
    }

    let claimed = false;
    try {
      claimed = await replayStore.claim(replayKey);
    } catch {
      res.status(503).json({
        error: 'REPLAY_STORE_UNAVAILABLE',
        message: 'Replay ledger unavailable.',
      });
      return;
    }

    if (!claimed) {
      res.status(409).json({
        error: 'PAYMENT_REPLAY_DETECTED',
        message: 'This on-chain transaction has already been redeemed for an x402 request.',
      });
      return;
    }

    const receipt: X402VerifiedPayment = {
      rail: paymentHeader.rail,
      txHash: canonicalTx,
      observedBaseUnits: verified.observed.toString(),
      recipient:
        paymentHeader.rail === 'solana-usdc'
          ? options.solanaTreasuryAddress
          : options.nanoTreasuryAddress || '',
      verifiedAtIso: new Date().toISOString(),
    };
    req.x402Payment = receipt;
    res.setHeader('X-Payment-Response', Buffer.from(JSON.stringify(receipt), 'utf8').toString('base64'));
    next();
  };
}
