# Contributing to DiffLens

Thanks for helping improve DiffLens.

## Development requirements

- Node.js 24
- pnpm 11.17.x

Install from the committed lockfile:

```bash
pnpm install --frozen-lockfile
```

Run the local app with:

```bash
pnpm dev
```

## Quality checks

Before opening a pull request, run:

```bash
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Do not weaken tests, comparison semantics, security checks, or warning thresholds merely to make a change pass.

## Product boundaries

V0.1 is a deterministic, local-first structured-data comparison tool. Changes should preserve the public comparison contract, file-adapter behavior, local processing model, safe export behavior, and accessible browser workflow.

Large behavioral changes should include tests that demonstrate the intended semantics. Parser or production dependency changes should include security and license review.

## Test data

Use synthetic fixtures and examples only. Never commit customer data, credentials, tokens, private URLs, or other sensitive material.

## Pull requests

Keep changes focused. Explain the user-facing effect, tests performed, and any security/privacy or compatibility implications. When behavior changes, update the relevant public documentation in the same pull request.

## Security reports

Do not disclose sensitive vulnerabilities in a public issue. Follow [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the repository's MIT License.
