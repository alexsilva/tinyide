import { expect, test } from "@playwright/test";
import { createWorkspace, launchIde, openProject } from "./ide-app.mjs";

test.describe("filtro do Explorer", () => {
  /** @type {Awaited<ReturnType<typeof createWorkspace>>} */
  let workspace;
  /** @type {Awaited<ReturnType<typeof launchIde>>} */
  let ide;

  test.beforeAll(async () => {
    workspace = await createWorkspace({
      "e2e/panel-window.spec.mjs": "export const exactExplorerMatch = true;\n",
      "plugins/python/src/vendor/jedi/third_party/typeshed/stdlib/2/distutils/command/sample.py": "pass\n",
      "CaseSensitive.ts": "export const upperCasePath = true;\n",
      "casesensitive.ts": "export const lowerCasePath = true;\n",
      "chat.txt": "caret regression fixture\n",
    });
    ide = await launchIde(workspace.root);
    await openProject(ide.window);
  });

  test.afterAll(async () => {
    await ide?.close();
    await workspace?.dispose();
  });

  test("alternates fuzzy and exact path matching", async () => {
    const { window } = ide;
    await window.getByLabel("Buscar arquivos no Explorer").click();
    const input = window.getByLabel("Filtrar arquivos do Explorer");
    await input.fill("e2e");

    await expect(window.getByText("panel-window.spec.mjs", { exact: true })).toBeVisible();
    await expect(window.getByText("plugins", { exact: true })).toBeVisible();

    const exact = window.getByRole("button", { name: "Correspondência exata" });
    await exact.click();
    await expect(exact).toHaveAttribute("aria-pressed", "true");
    await expect(window.getByText("panel-window.spec.mjs", { exact: true })).toBeVisible();
    await expect(window.getByText("plugins", { exact: true })).toHaveCount(0);
  });

  test("alternates case-insensitive and case-sensitive path matching", async () => {
    const { window } = ide;
    const input = window.getByLabel("Filtrar arquivos do Explorer");
    await input.fill("CaseSensitive");

    await expect(window.getByText("CaseSensitive.ts", { exact: true })).toBeVisible();
    await expect(window.getByText("casesensitive.ts", { exact: true })).toBeVisible();

    const caseSensitive = window.getByRole("button", { name: "Diferenciar maiúsculas de minúsculas" });
    await caseSensitive.click();
    await expect(caseSensitive).toHaveAttribute("aria-pressed", "true");
    await expect(window.getByText("CaseSensitive.ts", { exact: true })).toBeVisible();
    await expect(window.getByText("casesensitive.ts", { exact: true })).toHaveCount(0);
  });

  test("keeps the caret where the user placed it while editing the query", async () => {
    const { window } = ide;
    const input = window.getByLabel("Filtrar arquivos do Explorer");
    await input.fill("chat");
    await input.evaluate((element) => {
      element.focus();
      element.setSelectionRange(0, 0);
    });

    await window.keyboard.type("AB", { delay: 80 });
    await expect(input).toHaveValue("ABchat");
    await expect.poll(() => input.evaluate((element) => element.selectionStart)).toBe(2);
  });
});
