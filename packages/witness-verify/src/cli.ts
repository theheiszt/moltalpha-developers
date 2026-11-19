#!/usr/bin/env node
import fs from 'node:fs';
import {
  DEFAULT_MOLTALPHA_GATEWAY_URL,
  fetchWitnessKeyRegistry,
  verifyWithLiveRegistry,
  verifyWitnessSignature,
} from './index.js';

function printUsage(): void {
  console.log(`MoltALPHA Open Witness Verifier CLI (@moltalpha/witness-verify)

Usage:
  moltalpha-verify keys [--gateway https://api.moltalpha.dev]
  moltalpha-verify verify <receipt.json> [--gateway https://api.moltalpha.dev] [--spki-hex <hex>]

Receipt JSON shape:
  {
    "payload": { ... },            // or "canonicalJson": "{...}"
    "signature": "<hex|base64>",   // optional "ed25519:" prefix supported
    "keyId": "wit_key_a8a5281fbf00",
    "payloadSha256": "<optional sha256 hex>"
  }
`);
}

function getArgValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === '--help' || cmd === '-h') {
    printUsage();
    return;
  }

  const gatewayUrl = getArgValue(args, '--gateway') || DEFAULT_MOLTALPHA_GATEWAY_URL;

  if (cmd === 'keys') {
    const registry = await fetchWitnessKeyRegistry({ gatewayUrl });
    console.log(JSON.stringify(registry, null, 2));
    return;
  }

  if (cmd === 'verify' || cmd.startsWith('--')) {
    const payloadArg = getArgValue(args, '--payload');
    const canonicalArg = getArgValue(args, '--canonical');
    const signatureFlag = getArgValue(args, '--signature');
    const spkiHex = getArgValue(args, '--spki-hex');
    const publicKeyPem = getArgValue(args, '--public-key-pem');
    const publicKeyBase58 = getArgValue(args, '--public-key-base58');
    const keyIdFlag = getArgValue(args, '--key-id');
    const expectedShaFlag = getArgValue(args, '--expected-sha256');
    const signingInputFlag = getArgValue(args, '--signing-input') as 'canonical_json' | 'sha256_hex' | undefined;

    let payload: unknown;
    let canonicalJson: string | undefined = canonicalArg;
    let signature = signatureFlag || '';
    let keyId = keyIdFlag;
    let expectedPayloadSha256 = expectedShaFlag;

    if (payloadArg !== undefined || canonicalArg !== undefined) {
      if (payloadArg !== undefined) {
        const rawPayloadText = fs.existsSync(payloadArg) ? fs.readFileSync(payloadArg, 'utf8') : payloadArg;
        payload = JSON.parse(rawPayloadText);
      }
    } else if (cmd === 'verify') {
      const receiptPath = args[1];
      if (!receiptPath || receiptPath.startsWith('--')) {
        console.error('Error: path to a JSON receipt file is required.');
        process.exitCode = 1;
        return;
      }

      const raw = JSON.parse(fs.readFileSync(receiptPath, 'utf8')) as {
        payload?: unknown;
        canonicalJson?: string;
        signature?: string;
        keyId?: string;
        key_id?: string;
        signing_key_id?: string;
        payloadSha256?: string;
        evidence_hash?: string;
      };

      payload = raw.payload;
      canonicalJson = raw.canonicalJson;
      signature = signatureFlag || String(raw.signature || '');
      keyId = keyIdFlag || raw.keyId || raw.key_id || raw.signing_key_id;
      expectedPayloadSha256 = expectedShaFlag || raw.payloadSha256 || raw.evidence_hash;
    } else {
      console.error(`Unknown command: ${cmd}`);
      printUsage();
      process.exitCode = 1;
      return;
    }

    const hasInlineKey = Boolean(spkiHex || publicKeyPem || publicKeyBase58);
    const result = hasInlineKey
      ? verifyWitnessSignature({
          payload,
          canonicalJson,
          signature,
          publicKeySpkiHex: spkiHex,
          publicKeyPem,
          publicKeyBase58,
          expectedPayloadSha256,
          signingInput: signingInputFlag,
        })
      : await verifyWithLiveRegistry({
          payload,
          canonicalJson,
          signature,
          keyId,
          expectedPayloadSha256,
          gatewayUrl,
          signingInput: signingInputFlag,
        });

    console.log(JSON.stringify(result, null, 2));
    if (!result.valid) {
      process.exitCode = 1;
    }
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  printUsage();
  process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
