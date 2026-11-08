import { execFileSync } from 'node:child_process';
import { readFileSync, lstatSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const allowed = new Set(['README.md', '.gitignore', 'SECURITY.md', 'examples/market.mjs', 'examples/market.py', 'tests/market.test.mjs', 'scripts/check-public-boundary.mjs', '.github/workflows/check.yml']);
const patterns = [/-----BEGIN (?:EC |RSA |OPENSSH )?PRIVATE KEY-----/, /AIza[0-9A-Za-z_-]{30,}/, /gh[pousr]_[0-9A-Za-z]{30,}/, /github_pat_[0-9A-Za-z_]{30,}/];
export function checkFile(name, contents, symlink = false) {
  if (!allowed.has(name) || symlink) throw new Error(`Unreviewed public path: ${name}`);
  if (patterns.some(pattern => pattern.test(contents))) throw new Error(`Possible credential in ${name}; value suppressed`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  for (const name of tracked) { const path = resolve(root, name); checkFile(name, readFileSync(path, 'utf8'), lstatSync(path).isSymbolicLink()); }
  console.log(`Checked ${tracked.length} allowlisted public files; no credential-pattern matches.`);
}
