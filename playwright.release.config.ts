import { defineConfig } from '@playwright/test';

const channel = process.env.DIFFLENS_BROWSER_CHANNEL;

if (channel !== 'chrome' && channel !== 'msedge') {
  throw new Error(
    'DIFFLENS_BROWSER_CHANNEL must be set to either "chrome" or "msedge" for release verification.',
  );
}

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  timeout: 180_000,
  expect: {
    timeout: 120_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:4173',
    channel,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm --filter @difflens/web preview --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
