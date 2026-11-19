import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const allowed = new Set([
  '.github/workflows/check.yml',
  '.gitignore',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'README.md',
  'SECURITY.md',
  'docs/api-reference.md',
  'docs/authentication.md',
  'docs/error-handling.md',
  'docs/errors.md',
  'docs/market-data.md',
  'docs/payment-lifecycle.md',
  'docs/payment-platform-reorientation-audit.md',
  'docs/payments.md',
  'docs/quickstart.md',
  'docs/security-best-practices.md',
  'docs/sentinel.md',
  'docs/settlement-verification.md',
  'docs/webhooks.md',
  'docs/witness.md',
  'examples/ai-agent-payments/env.template',
  'examples/ai-agent-payments/README.md',
  'examples/ai-agent-payments/agent-checkout.mjs',
  'examples/market.mjs',
  'examples/market.py',
  'examples/node-checkout/env.template',
  'examples/node-checkout/README.md',
  'examples/node-checkout/checkout.mjs',
  'examples/python-checkout/env.template',
  'examples/python-checkout/README.md',
  'examples/python-checkout/checkout.py',
  'examples/react-checkout/env.template',
  'examples/react-checkout/MoltAlphaCheckout.tsx',
  'examples/react-checkout/README.md',
  'examples/webhook-server/env.template',
  'examples/webhook-server/README.md',
  'examples/webhook-server/server.mjs',
  'packages/solana-agent-kit-plugin/LICENSE',
  'packages/solana-agent-kit-plugin/README.md',
  'packages/solana-agent-kit-plugin/dist/index.d.ts',
  'packages/solana-agent-kit-plugin/dist/index.d.ts.map',
  'packages/solana-agent-kit-plugin/dist/index.js',
  'packages/solana-agent-kit-plugin/dist/index.js.map',
  'packages/solana-agent-kit-plugin/package.json',
  'packages/solana-agent-kit-plugin/src/index.test.ts',
  'packages/solana-agent-kit-plugin/src/index.ts',
  'packages/solana-agent-kit-plugin/tsconfig.build.json',
  'packages/witness-verify/LICENSE',
  'packages/witness-verify/README.md',
  'packages/witness-verify/dist/cli.d.ts',
  'packages/witness-verify/dist/cli.d.ts.map',
  'packages/witness-verify/dist/cli.js',
  'packages/witness-verify/dist/cli.js.map',
  'packages/witness-verify/dist/index.d.ts',
  'packages/witness-verify/dist/index.d.ts.map',
  'packages/witness-verify/dist/index.js',
  'packages/witness-verify/dist/index.js.map',
  'packages/witness-verify/package.json',
  'packages/witness-verify/src/cli.ts',
  'packages/witness-verify/src/index.test.ts',
  'packages/witness-verify/src/index.ts',
  'packages/witness-verify/tsconfig.build.json',
  'packages/x402-solana-middleware/LICENSE',
  'packages/x402-solana-middleware/README.md',
  'packages/x402-solana-middleware/dist/index.d.ts',
  'packages/x402-solana-middleware/dist/index.d.ts.map',
  'packages/x402-solana-middleware/dist/index.js',
  'packages/x402-solana-middleware/dist/index.js.map',
  'packages/x402-solana-middleware/package.json',
  'packages/x402-solana-middleware/src/index.test.ts',
  'packages/x402-solana-middleware/src/index.ts',
  'packages/x402-solana-middleware/tsconfig.build.json',
  'schemas/market-intelligence.schema.json',
  'schemas/payment-config.schema.json',
  'schemas/sentinel-public-key.schema.json',
  'schemas/state-witness.schema.json',
  'schemas/witness-public-keys.schema.json',
  'scripts/check-public-boundary.mjs',
  'sdk/javascript/http.mjs',
  'sdk/javascript/index.mjs',
  'sdk/javascript/market.mjs',
  'sdk/javascript/payments.mjs',
  'sdk/javascript/sentinel.mjs',
  'sdk/javascript/witness.mjs',
  'sdk/python/moltalpha_sdk/__init__.py',
  'sdk/python/moltalpha_sdk/_ed25519.py',
  'sdk/python/moltalpha_sdk/http_client.py',
  'sdk/python/moltalpha_sdk/market.py',
  'sdk/python/moltalpha_sdk/payments.py',
  'sdk/python/moltalpha_sdk/sentinel.py',
  'sdk/python/moltalpha_sdk/witness.py',
  'sdk/python/pyproject.toml',
  'sdk/typescript/README.md',
  'sdk/typescript/dist/index.d.ts',
  'sdk/typescript/dist/index.js',
  'sdk/typescript/package.json',
  'sdk/typescript/src/index.ts',
  'sdk/typescript/tsconfig.json',
  'tests/market.test.mjs',
  'tests/sdk.test.mjs',
  'tests/test_sdk.py',
  'tools/integration-healthcheck/README.md',
  'tools/integration-healthcheck/cli.mjs',
  'tools/payment-verifier/README.md',
  'tools/payment-verifier/cli.mjs',
  'tools/webhook-tester/README.md',
  'tools/webhook-tester/cli.mjs',
]);

const patterns = [
  new RegExp('-----BEGIN ' + '(?:EC |RSA |OPENSSH )?PRIVATE KEY-----'),
  /AIza[0-9A-Za-z_-]{30,}/,
  /gh[pousr]_[0-9A-Za-z]{30,}/,
  /github_pat_[0-9A-Za-z_]{30,}/,
  /mk_live_[0-9A-Za-z_-]{16,}/,
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
  new RegExp(['34', '130', '147', '96'].join('\\.')),
  new RegExp('/opt/' + 'moltbook-alpha'),
];

export function checkFile(name, contents, symlink = false) {
  if (!allowed.has(name) || symlink) {
    throw new Error(`Unreviewed public path: ${name}`);
  }
  if (patterns.some((pattern) => pattern.test(contents))) {
    throw new Error(`Possible credential or forbidden internal pattern in ${name}; value suppressed`);
  }
}

export function run() {
  const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
  for (const file of files) {
    const stat = lstatSync(file);
    checkFile(file, readFileSync(file, 'utf8'), stat.isSymbolicLink());
  }
  console.log(`Checked ${files.length} allowlisted public files; no credential-pattern matches.`);
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  run();
}
