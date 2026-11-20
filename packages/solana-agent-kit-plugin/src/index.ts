import {
  DEFAULT_MOLTALPHA_GATEWAY_URL,
  fetchWitnessKeyRegistry,
  verifyWithLiveRegistry,
  type VerifyWitnessSignatureResult,
  type WitnessKeyRegistryResponse,
} from '../../witness-verify/dist/index.js';

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
  examples: Array<{ input: TInput; explanation: string }>;
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
    }) => Promise<VerifyWitnessSignatureResult & { keyId: string; keyStatus: string | null }>;
    getFirstPassageProbability: (params?: {
      pair?: string;
      targetNetPct?: number;
    }) => Promise<Record<string, unknown>>;
    getDataProducts: () => Promise<Record<string, unknown>>;
    getIntelSample: () => Promise<Record<string, unknown>>;
  };
  actions: AgentKitActionDefinition[];
}

async function fetchGatewayJson(
  url: string,
  config: MoltAlphaPluginConfig
): Promise<Record<string, unknown>> {
  const fetcher = config.fetchImpl || fetch;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (config.apiKey && config.apiKey.trim().length > 0) {
    headers['X-API-KEY'] = config.apiKey.trim();
  }
  const res = await fetcher(url, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(config.timeoutMs ?? 6_000),
  });
  if (!res.ok) {
    throw new Error(`MOLTALPHA_GATEWAY_HTTP_${res.status}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

/**
 * Creates a Solana Agent Kit / SendAI-compatible plugin exposing MoltALPHA
 * pre-trade DEX risk probability feeds and offline Ed25519 witness verification.
 */
export function createMoltAlphaAgentKitPlugin(
  config: MoltAlphaPluginConfig = {}
): MoltAlphaAgentKitPlugin {
  if (
    config.timeoutMs !== undefined &&
    (typeof config.timeoutMs !== 'number' || !Number.isFinite(config.timeoutMs) || config.timeoutMs <= 0)
  ) {
    throw new Error('INVALID_TIMEOUT_MS');
  }
  if (
    config.gatewayUrl !== undefined &&
    (typeof config.gatewayUrl !== 'string' || !/^https?:\/\//i.test(config.gatewayUrl))
  ) {
    throw new Error('INVALID_GATEWAY_URL');
  }

  const gatewayUrl = (config.gatewayUrl || DEFAULT_MOLTALPHA_GATEWAY_URL).replace(/\/+$/, '');

  const methods: MoltAlphaAgentKitPlugin['methods'] = {
    async getWitnessPublicKeys() {
      return fetchWitnessKeyRegistry({
        gatewayUrl,
        fetchImpl: config.fetchImpl,
        timeoutMs: config.timeoutMs,
      });
    },

    async verifyWitnessReceipt(input) {
      if (!input || typeof input !== 'object') {
        throw new Error('WITNESS_INPUT_REQUIRED: input must be a non-null object');
      }
      if (typeof input.signature !== 'string' || input.signature.trim().length === 0) {
        throw new Error('WITNESS_SIGNATURE_REQUIRED: signature must be a non-empty string');
      }
      return verifyWithLiveRegistry({
        ...input,
        gatewayUrl,
        fetchImpl: config.fetchImpl,
        timeoutMs: config.timeoutMs,
      });
    },

    async getFirstPassageProbability(params = {}) {
      if (params !== undefined && (params === null || typeof params !== 'object')) {
        throw new Error('INVALID_FIRST_PASSAGE_PARAMS');
      }
      const safeParams = params || {};
      if (safeParams.targetNetPct !== undefined) {
        if (typeof safeParams.targetNetPct !== 'number' || !Number.isFinite(safeParams.targetNetPct)) {
          throw new Error('INVALID_TARGET_NET_PCT: targetNetPct must be a finite number');
        }
      }
      const qs = new URLSearchParams();
      if (safeParams.pair) qs.set('pair', safeParams.pair);
      if (typeof safeParams.targetNetPct === 'number') {
        qs.set('target_net_pct', String(safeParams.targetNetPct));
      }
      const suffix = qs.toString() ? `?${qs.toString()}` : '';
      return fetchGatewayJson(`${gatewayUrl}/v1/quant/first-passage${suffix}`, config);
    },

    async getDataProducts() {
      return fetchGatewayJson(`${gatewayUrl}/v1/data-products`, config);
    },

    async getIntelSample() {
      return fetchGatewayJson(`${gatewayUrl}/v1/intel/sample`, config);
    },
  };

  const actions: AgentKitActionDefinition[] = [
    {
      name: 'MOLTALPHA_GET_WITNESS_KEYS',
      similes: ['get witness public keys', 'fetch moltalpha ed25519 keys'],
      description:
        'Retrieves MoltALPHA authoritative rotating Ed25519 SPKI witness public keys for offline signature verification.',
      examples: [
        {
          input: {},
          explanation: 'Fetch active Ed25519 witness key epoch from api.moltalpha.dev.',
        },
      ],
      handler: async () => methods.getWitnessPublicKeys(),
    },
    {
      name: 'MOLTALPHA_VERIFY_WITNESS',
      similes: ['verify ed25519 receipt', 'verify rfc8785 witness', 'check moltalpha signature'],
      description:
        'Cryptographically verifies an RFC 8785 canonical JSON receipt against MoltALPHA authoritative Ed25519 witness keys.',
      examples: [
        {
          input: {
            payload: { pool: 'Raydium_SOL_USDC', risk_score: 2.1 },
            signature: '<ed25519-hex-or-base64>',
            keyId: 'wit_key_a8a5281fbf00',
          },
          explanation: 'Verify risk assessment signature offline before signing a Solana swap.',
        },
      ],
      handler: async (input) => {
        if (!input || typeof input !== 'object') {
          throw new Error('WITNESS_INPUT_REQUIRED: input must be a non-null object');
        }
        return methods.verifyWitnessReceipt({
          payload: input.payload,
          canonicalJson: typeof input.canonicalJson === 'string' ? input.canonicalJson : undefined,
          signature: typeof input.signature === 'string' ? input.signature : '',
          keyId: typeof input.keyId === 'string' ? input.keyId : undefined,
          expectedPayloadSha256:
            typeof input.expectedPayloadSha256 === 'string'
              ? input.expectedPayloadSha256
              : undefined,
          signingInput:
            input.signingInput === 'canonical_json' || input.signingInput === 'sha256_hex'
              ? input.signingInput
              : undefined,
        });
      },
    },
    {
      name: 'MOLTALPHA_GET_FIRST_PASSAGE_RISK',
      similes: ['check solana dex trade viability', 'get first passage probability'],
      description:
        'Fetches Solana DEX first-passage trade viability & spread-adjusted probability metrics from MoltALPHA.',
      examples: [
        {
          input: { pair: 'BONK/SOL', targetNetPct: 0.015 },
          explanation: 'Evaluate probability of hitting target net return before executing a Solana swap.',
        },
      ],
      handler: async (input) => {
        if (!input || typeof input !== 'object') {
          return methods.getFirstPassageProbability({});
        }
        if (input.targetNetPct !== undefined && (typeof input.targetNetPct !== 'number' || !Number.isFinite(input.targetNetPct))) {
          throw new Error('INVALID_TARGET_NET_PCT: targetNetPct must be a finite number');
        }
        return methods.getFirstPassageProbability({
          pair: typeof input.pair === 'string' ? input.pair : undefined,
          targetNetPct: typeof input.targetNetPct === 'number' ? input.targetNetPct : undefined,
        });
      },
    },
    {
      name: 'MOLTALPHA_GET_DATA_PRODUCTS',
      similes: ['list moltalpha data feeds', 'get solana intelligence catalog'],
      description:
        'Lists MoltALPHA live verifiable Solana DEX intelligence feeds and evaluation samples.',
      examples: [
        {
          input: {},
          explanation: 'Inspect live data product catalog and pricing on api.moltalpha.dev.',
        },
      ],
      handler: async () => methods.getDataProducts(),
    },
  ];

  return {
    name: 'moltalpha-witness-and-risk',
    version: '1.0.0',
    gatewayUrl,
    methods,
    actions,
  };
}
