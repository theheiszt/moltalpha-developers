export const SOLANA_MAINNET_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const DEFAULT_SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';
export const DEFAULT_NANO_RPC_URLS = [
    'https://rpc.nano.to',
    'https://uk1.public.xnopay.com/proxy',
    'https://rainstorm.city/api',
];
const SOLANA_TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const SOLANA_TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const SOLANA_ADDRESS_REGEX = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const NANO_ADDRESS_REGEX = /^nano_[13][13456789abcdefghijkmnopqrstuwxyz]{59}$/;
const SOLANA_SIG_REGEX = /^[1-9A-HJ-NP-Za-km-z]{80,90}$/;
const NANO_HASH_REGEX = /^[0-9a-fA-F]{64}$/;
export class InMemoryX402ReplayStore {
    seen = new Set();
    maxEntries;
    constructor(options) {
        const max = options?.maxEntries ?? 100_000;
        if (!Number.isInteger(max) || max < 1) {
            throw new Error('INVALID_REPLAY_STORE_MAX_ENTRIES');
        }
        this.maxEntries = max;
    }
    has(key) {
        return this.seen.has(key);
    }
    claim(key) {
        if (this.seen.has(key))
            return false;
        if (this.seen.size >= this.maxEntries) {
            const oldest = this.seen.values().next().value;
            if (oldest !== undefined)
                this.seen.delete(oldest);
        }
        this.seen.add(key);
        return true;
    }
    add(key) {
        this.claim(key);
    }
}
export function canonicalizeReplayTxHash(rail, txHash) {
    const trimmed = txHash.trim();
    return rail === 'nano' ? trimmed.toLowerCase() : trimmed; // Solana Base58 is case-sensitive
}
function parseNonNegativeBigInt(raw) {
    if (typeof raw === 'bigint')
        return raw >= 0n ? raw : null;
    if (typeof raw === 'number') {
        return Number.isSafeInteger(raw) && raw >= 0 ? BigInt(raw) : null;
    }
    if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) {
        try {
            return BigInt(raw.trim());
        }
        catch {
            return null;
        }
    }
    return null;
}
function validateMiddlewareOptions(options) {
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
    if (options.usdcMintAddress !== undefined &&
        (typeof options.usdcMintAddress !== 'string' || !SOLANA_ADDRESS_REGEX.test(options.usdcMintAddress))) {
        throw new Error('X402_INVALID_USDC_MINT');
    }
    if (options.nanoTreasuryAddress !== undefined) {
        if (typeof options.nanoTreasuryAddress !== 'string' ||
            !NANO_ADDRESS_REGEX.test(options.nanoTreasuryAddress) ||
            typeof options.minNanoRaw !== 'bigint' ||
            options.minNanoRaw <= 0n) {
            throw new Error('X402_INVALID_NANO_CONFIG');
        }
    }
    if (options.minNanoRaw !== undefined) {
        if (typeof options.minNanoRaw !== 'bigint' ||
            options.minNanoRaw <= 0n ||
            !options.nanoTreasuryAddress) {
            throw new Error('X402_INVALID_NANO_CONFIG');
        }
    }
    if (options.maxTxAgeSeconds !== undefined &&
        (typeof options.maxTxAgeSeconds !== 'number' ||
            !Number.isFinite(options.maxTxAgeSeconds) ||
            options.maxTxAgeSeconds <= 0)) {
        throw new Error('X402_INVALID_MAX_TX_AGE');
    }
    if (options.solanaRpcUrl !== undefined &&
        (typeof options.solanaRpcUrl !== 'string' || !/^https?:\/\//i.test(options.solanaRpcUrl))) {
        throw new Error('X402_INVALID_SOLANA_RPC_URL');
    }
    if (options.nanoRpcUrls !== undefined &&
        (!Array.isArray(options.nanoRpcUrls) ||
            options.nanoRpcUrls.length === 0 ||
            !options.nanoRpcUrls.every((u) => typeof u === 'string' && /^https?:\/\//i.test(u)))) {
        throw new Error('X402_INVALID_NANO_RPC_URLS');
    }
}
function readHeader(req, name) {
    const lower = name.toLowerCase();
    for (const [k, v] of Object.entries(req.headers || {})) {
        if (k.toLowerCase() === lower) {
            if (Array.isArray(v))
                return v[0]?.trim() || null;
            return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
        }
    }
    return null;
}
/**
 * Parses `X-Payment` header in either structured JSON/base64 JSON (`{"rail":"solana-usdc","txHash":"..."}`)
 * or compact `rail:txHash` format (`solana-usdc:<sig>` or `nano:<hash>`).
 */
export function parseX402PaymentHeader(req) {
    const raw = readHeader(req, 'x-payment') || readHeader(req, 'x-payment-tx');
    if (!raw)
        return null;
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
            const parsed = JSON.parse(candidate);
            const rail = String(parsed.rail || '').toLowerCase();
            const txHash = String(parsed.txHash || parsed.tx_hash || '').trim();
            if ((rail === 'solana-usdc' || rail === 'nano') && txHash.length > 0) {
                return { rail, txHash };
            }
        }
        catch {
            // try next format
        }
    }
    return null;
}
export function buildX402ChallengePayload(options, resourcePath) {
    const accepts = [
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
async function verifySolanaUsdcPayment(txHash, options, fetcher) {
    if (!SOLANA_SIG_REGEX.test(txHash)) {
        return { ok: false, status: 400, code: 'INVALID_TX_HASH', message: 'Malformed Solana transaction signature.' };
    }
    const rpcUrl = options.solanaRpcUrl || DEFAULT_SOLANA_RPC_URL;
    const mint = options.usdcMintAddress || SOLANA_MAINNET_USDC_MINT;
    const maxAgeSec = options.maxTxAgeSeconds ?? 900;
    let tx;
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
        const body = (await res.json());
        tx = body.result ?? null;
    }
    catch {
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
        if (ageSec > maxAgeSec) {
            return { ok: false, status: 422, code: 'TX_EXPIRED', message: `Solana transaction exceeds ${maxAgeSec}s freshness window.` };
        }
    }
    else if (!options.allowMissingTxTimestamp) {
        return {
            ok: false,
            status: 422,
            code: 'TX_TIMESTAMP_UNAVAILABLE',
            message: 'Solana transaction blockTime is missing; cannot verify freshness.',
        };
    }
    const accountKeys = (tx.transaction?.message?.accountKeys || []).map((k) => typeof k === 'string' ? k : String(k?.pubkey || ''));
    const preBalances = tx.meta.preTokenBalances || [];
    const postBalances = tx.meta.postTokenBalances || [];
    const treasuryAccounts = new Set([options.solanaTreasuryAddress]);
    const treasuryIndices = new Set();
    for (const row of postBalances) {
        if (row.owner === options.solanaTreasuryAddress && row.mint === mint && typeof row.accountIndex === 'number') {
            treasuryIndices.add(row.accountIndex);
            const pubkey = accountKeys[row.accountIndex];
            if (pubkey)
                treasuryAccounts.add(pubkey);
        }
    }
    const preMap = new Map();
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
        const isSplToken = ix.program === 'spl-token' ||
            ix.programId === SOLANA_TOKEN_PROGRAM_ID ||
            ix.programId === SOLANA_TOKEN_2022_PROGRAM_ID;
        if (!isSplToken)
            continue;
        const type = ix.parsed?.type;
        const info = ix.parsed?.info || {};
        const dest = typeof info.destination === 'string' ? info.destination : '';
        if (!treasuryAccounts.has(dest))
            continue;
        if (type === 'transferChecked') {
            if (info.mint !== mint)
                continue;
            const rawAmt = info.tokenAmount?.amount;
            const amt = parseNonNegativeBigInt(rawAmt);
            if (amt === null) {
                return {
                    ok: false,
                    status: 502,
                    code: 'MALFORMED_RPC_RESPONSE',
                    message: 'Solana RPC returned malformed transferChecked amount.',
                };
            }
            if (amt > 0n)
                transferred += amt;
        }
        else if (type === 'transfer') {
            if (dest === options.solanaTreasuryAddress || treasuryIndices.size === 0)
                continue;
            const amt = parseNonNegativeBigInt(info.amount);
            if (amt === null) {
                return {
                    ok: false,
                    status: 502,
                    code: 'MALFORMED_RPC_RESPONSE',
                    message: 'Solana RPC returned malformed transfer amount.',
                };
            }
            if (amt > 0n)
                transferred += amt;
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
async function verifyNanoPayment(txHash, options, fetcher) {
    if (!options.nanoTreasuryAddress || !options.minNanoRaw || options.minNanoRaw <= 0n) {
        return { ok: false, status: 400, code: 'NANO_RAIL_DISABLED', message: 'Nano rail is not enabled on this endpoint.' };
    }
    if (!NANO_HASH_REGEX.test(txHash)) {
        return { ok: false, status: 400, code: 'INVALID_TX_HASH', message: 'Malformed 64-char Nano block hash.' };
    }
    const rpcUrls = options.nanoRpcUrls && options.nanoRpcUrls.length > 0 ? options.nanoRpcUrls : DEFAULT_NANO_RPC_URLS;
    const maxAgeSec = options.maxTxAgeSeconds ?? 900;
    let validInfo = null;
    let lastBlockError = null;
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
            const parsed = (await res.json());
            if (parsed && !parsed.error) {
                validInfo = parsed;
                break;
            }
            lastBlockError = parsed?.error ? String(parsed.error) : 'Unknown Nano RPC error';
        }
        catch {
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
        if (ageSec > maxAgeSec) {
            return { ok: false, status: 422, code: 'TX_EXPIRED', message: `Nano block exceeds ${maxAgeSec}s freshness window.` };
        }
    }
    else if (!options.allowMissingTxTimestamp) {
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
export function createX402SolanaMiddleware(options) {
    validateMiddlewareOptions(options);
    if (options.replayStore && typeof options.replayStore.claim !== 'function') {
        throw new Error('X402_REPLAY_STORE_MISSING_CLAIM');
    }
    if (!options.replayStore &&
        !warnedInMemoryProductionStore &&
        typeof process !== 'undefined' &&
        process.env?.NODE_ENV === 'production') {
        warnedInMemoryProductionStore = true;
        console.warn('[x402-solana-middleware] Using single-instance InMemoryX402ReplayStore in production; pass a shared atomic X402ReplayStore (Redis/Postgres/Firestore).');
    }
    const replayStore = options.replayStore || new InMemoryX402ReplayStore();
    const fetcher = options.fetchImpl || fetch;
    return async function x402Middleware(req, res, next) {
        if (options.allowBypass) {
            try {
                if (await options.allowBypass(req)) {
                    next();
                    return;
                }
            }
            catch {
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
        }
        catch {
            res.status(503).json({
                error: 'REPLAY_STORE_UNAVAILABLE',
                message: 'Replay ledger unavailable.',
            });
            return;
        }
        const verified = paymentHeader.rail === 'solana-usdc'
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
        }
        catch {
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
        const receipt = {
            rail: paymentHeader.rail,
            txHash: canonicalTx,
            observedBaseUnits: verified.observed.toString(),
            recipient: paymentHeader.rail === 'solana-usdc'
                ? options.solanaTreasuryAddress
                : options.nanoTreasuryAddress || '',
            verifiedAtIso: new Date().toISOString(),
        };
        req.x402Payment = receipt;
        res.setHeader('X-Payment-Response', Buffer.from(JSON.stringify(receipt), 'utf8').toString('base64'));
        next();
    };
}
//# sourceMappingURL=index.js.map