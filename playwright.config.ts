import { defineConfig, devices } from '@playwright/test';
import {
  STUDENT_FE_PORT,
  STUDENT_FE_REPO_PATH,
  STUDENT_FE_URL,
  TEACHER_FE_PORT,
  TEACHER_FE_URL,
} from './e2e/constants';

/**
 * A specek egy MEGOSZTOTT, a globalSetup által frissen seedelt DB-n futnak
 * egyetlen backend-példány ellen — emiatt sorosan futnak (workers: 1), hogy
 * ne ütközzenek egymással (pl. egyidejű regisztráció ugyanarra az egyetlen
 * admin-jóváhagyási sorra). Ld. e2e/README.md a teljes futtatási modellért.
 *
 * A backend NEM a webServer configon át indul — a Playwright `webServer`
 * plugin-jei a globalSetup fájl ELŐTT futnak le, tehát a DB-konténer+séma
 * seedelése előtt próbálná elindítani a backendet, ami elhasalna (üres
 * Roles tábla -> dinamikus policy-provider hiba, nincs séma -> Hangfire
 * crash). A backendet ezért a global-setup.ts indítja manuálisan, a
 * seedelés UTÁN — ld. ott a részletes indoklást.
 */
export default defineConfig({
  testDir: './e2e/tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: require.resolve('./e2e/global-setup.ts'),
  globalTeardown: require.resolve('./e2e/global-teardown.ts'),

  use: {
    baseURL: TEACHER_FE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],

  webServer: [
    {
      command: `npx ng serve --port ${STUDENT_FE_PORT}`,
      cwd: STUDENT_FE_REPO_PATH,
      url: STUDENT_FE_URL,
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      command: `npx ng serve --port ${TEACHER_FE_PORT}`,
      cwd: __dirname,
      url: TEACHER_FE_URL,
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
