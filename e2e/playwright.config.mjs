import { defineConfig } from "@playwright/test";

/**
 * Testes de fumaça sobre o aplicativo real: o Playwright lança o Electron do projeto,
 * então nenhum navegador extra precisa ser baixado e o que roda é o mesmo código que o
 * usuário abre no dia a dia.
 */
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.mjs",
  // Um teste de fumaça que demora é um teste que ninguém roda.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["github"]] : [["list"]],
  use: { trace: "retain-on-failure" },
});
