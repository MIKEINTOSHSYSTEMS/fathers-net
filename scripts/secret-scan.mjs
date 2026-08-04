#!/usr/bin/env node
/**
 * FathersNet secret scanner (NFR-022 / FR-170).
 * Scans git-tracked files for hard-coded secrets and private keys, mirroring
 * the CI `secret:scan` step. Exits non-zero on any finding.
 *
 * Design notes:
 * - Only scans files git would track (respects .gitignore) so it never
 *   flags generated artifacts (dist/, node_modules/, .env).
 * - Uses conservative regexes; tuned to reduce false positives.
 */
import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const IGNORED_EXTENSIONS = new Set([
  '.map',
  '.lock',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.ico',
  '.woff',
  '.woff2',
  '.pdf',
  '.crt',
  '.key',
  '.pem',
  '.tgz',
  '.zip',
]);

const PATTERNS = [
  { name: 'AWS access key', pattern: /AKIA[0-9A-Z]{16}/ },
  { name: 'GitHub token (classic)', pattern: /ghp_[A-Za-z0-9]{36}/ },
  { name: 'GitHub token (fine-grained)', pattern: /github_pat_[A-Za-z0-9_]{22,}/ },
  { name: 'Slack token', pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'Stripe secret key', pattern: /sk_live_[A-Za-z0-9]{24,}/ },
  { name: 'Google API key', pattern: /AIza[0-9A-Za-z_-]{35}/ },
  { name: 'private key block', pattern: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'JWT (loose)', pattern: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/ },
];

const MAX_BYTES = 512 * 1024;

const trackedFiles = execSync('git ls-files -z', {
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
})
  .split('\0')
  .filter(Boolean);

let findings = 0;

for (const file of trackedFiles) {
  const ext = file.slice(file.lastIndexOf('.'));
  if (IGNORED_EXTENSIONS.has(ext)) {
    continue;
  }
  let stat;
  try {
    stat = statSync(file);
  } catch {
    continue;
  }
  if (stat.size > MAX_BYTES) {
    continue;
  }

  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }

  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const { name, pattern } of PATTERNS) {
      if (pattern.test(line)) {
        findings += 1;
        const snippet = line
          .trim()
          .slice(0, 80)
          .replace(/[\r\n]/g, ' ');
        console.error(`[secret-scan] ${name} match: ${file}:${index + 1} -> ${snippet}`);
      }
    }
  });
}

if (findings > 0) {
  console.error(`secret-scan failed with ${findings} finding(s).`);
  process.exit(1);
}
console.log('secret-scan: no secrets found in tracked files.');
