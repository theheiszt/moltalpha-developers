import { type VerifyWitnessSignatureResult, type WitnessKeyRegistryResponse } from '@moltalpha/witness-verify';
export interface MoltAlphaPluginConfig {
    gatewayUrl?: string;
    apiKey?: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
}
export interface AgentKitActionDefinition<TInput = Record<string, unknown>, TOutput = unknown> {
    name: string;
    similes: string[];
    description: string;
    examples: Array<{
        input: TInput;
        explanation: string;
    }>;
    handler: (input: TInput) => Promise<TOutput>;
}
export interface MoltAlphaAgentKitPlugin {
    name: 'moltalpha-witness-and-risk';
    version: '1.0.0';
    gatewayUrl: string;
    methods: {
        getWitnessPublicKeys: () => Promise<WitnessKeyRegistryResponse>;
        verifyWitnessReceipt: (input: {
            payload?: unknown;
            canonicalJson?: string;
            signature: string;
            keyId?: string;
            expectedPayloadSha256?: string;
            signingInput?: 'canonical_json' | 'sha256_hex';
        }) => Promise<VerifyWitnessSignatureResult & {
            keyId: string;
            keyStatus: string | null;
        }>;
        getFirstPassageProbability: (params?: {
            pair?: string;
            targetNetPct?: number;
        }) => Promise<Record<string, unknown>>;
        getDataProducts: () => Promise<Record<string, unknown>>;
        getIntelSample: () => Promise<Record<string, unknown>>;
    };
    actions: AgentKitActionDefinition[];
}
/**
 * Creates a Solana Agent Kit / SendAI-compatible plugin exposing MoltALPHA
 * pre-trade DEX risk probability feeds and offline Ed25519 witness verification.
 */
export declare function createMoltAlphaAgentKitPlugin(config?: MoltAlphaPluginConfig): MoltAlphaAgentKitPlugin;
//# sourceMappingURL=index.d.ts.map