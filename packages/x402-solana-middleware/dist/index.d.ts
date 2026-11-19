export declare const SOLANA_MAINNET_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export declare const DEFAULT_SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";
export declare const DEFAULT_NANO_RPC_URLS: readonly ['https://rpc.nano.to', 'https://uk1.public.xnopay.com/proxy', 'https://rainstorm.city/api'];
export type X402Rail = 'solana-usdc' | 'nano';
export interface X402ReplayStore {
    has(key: string): boolean | Promise<boolean>;
    /** Atomically reserves `key` if absent. Returns `true` if claimed, `false` if already redeemed. */
    claim(key: string): boolean | Promise<boolean>;
    /** @deprecated Use atomic `claim(key)` instead. */
    add?(key: string): void | Promise<void>;
}
export declare class InMemoryX402ReplayStore implements X402ReplayStore {
    private readonly seen;
    private readonly maxEntries;
    constructor(options?: {
        maxEntries?: number;
    });
    has(key: string): boolean;
    claim(key: string): boolean;
    add(key: string): void;
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
export declare function canonicalizeReplayTxHash(rail: X402Rail, txHash: string): string;
/**
 * Parses `X-Payment` header in either structured JSON/base64 JSON (`{"rail":"solana-usdc","txHash":"..."}`)
 * or compact `rail:txHash` format (`solana-usdc:<sig>` or `nano:<hash>`).
 */
export declare function parseX402PaymentHeader(req: X402RequestLike): X402PaymentHeader | null;
export declare function buildX402ChallengePayload(options: X402MiddlewareOptions, resourcePath: string): {
    x402Version: number;
    error: string;
    message: string;
    resource: string;
    accepts: Record<string, string>[];
    docsUrl: string;
};
/**
 * Express-compatible HTTP 402 (x402) pay-per-call middleware for autonomous AI agents.
 * Issues a machine-readable HTTP 402 challenge when unpaid, verifies finalized Solana SPL USDC
 * or confirmed Zero-Fee Nano send blocks on-chain, and enforces atomic replay protection.
 */
export declare function createX402SolanaMiddleware(options: X402MiddlewareOptions): (req: X402RequestLike, res: X402ResponseLike, next: () => void) => Promise<void>;
//# sourceMappingURL=index.d.ts.map