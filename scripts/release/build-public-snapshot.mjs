import { execFileSync } from 'node:child_process';
import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

const repositoryRoot = process.cwd();
const outputRoot = resolve(process.argv[2] ?? 'release-artifacts/public-source');

const explicitRootFiles = new Set([
  '.editorconfig',
  '.gitignore',
  '.node-version',
  '.npmrc',
  '.nvmrc',
  '.prettierignore',
  '.prettierrc.json',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'README.md',
  'SECURITY.md',
  'THIRD_PARTY_NOTICES.md',
  'eslint.config.js',
  'firebase.json',
  'package.json',
  'playwright.config.ts',
  'playwright.release.config.ts',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.base.json',
  'tsconfig.json',
  'vitest.config.ts',
]);

const publicPrefixes = [
  '.github/ISSUE_TEMPLATE/',
  'apps/',
  'examples/',
  'packages/',
  'tests/',
];

const explicitPublicFiles = new Set([
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/workflows/quality.yml',
  '.github/workflows/release-verification.yml',
  'scripts/release/build-public-snapshot.mjs',
  'docs/README.md',
  'docs/ARCHITECTURE.md',
  'docs/COMPARISON_SEMANTICS.md',
  'docs/release/V0.1_RELEASE_NOTES.md',
  'docs/release/V0.1_BENCHMARK_RESULTS.md',
]);

function isPublicPath(path) {
  if (explicitRootFiles.has(path) || explicitPublicFiles.has(path)) {
    return true;
  }
  if (path.startsWith('docs/assets/')) {
    return true;
  }
  return publicPrefixes.some((prefix) => path.startsWith(prefix));
}

const tracked = execFileSync('git', ['ls-files', '-z'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
})
  .split('\0')
  .filter(Boolean);

const publicFiles = tracked.filter(isPublicPath).sort();
const excluded = tracked.filter((path) => !isPublicPath(path)).sort();

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

for (const path of publicFiles) {
  const destination = resolve(outputRoot, path);
  await mkdir(dirname(destination), { recursive: true });
  await cp(resolve(repositoryRoot, path), destination, { force: true });
}

const output = [
  `PUBLIC_SNAPSHOT_OUTPUT=${outputRoot}`,
  `PUBLIC_SNAPSHOT_FILES=${publicFiles.length}`,
  `PUBLIC_SNAPSHOT_EXCLUDED=${excluded.length}`,
  'PUBLIC_SNAPSHOT_EXCLUDED_PATHS',
  ...excluded,
  '',
].join('\n');

process.stdout.write(output);
