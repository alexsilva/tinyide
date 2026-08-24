import { expect, test } from "@playwright/test";
import { createWorkspace, launchIde, openProject } from "./ide-app.mjs";

test.describe("formatação de código por provider de linguagem", () => {
  /** @type {Awaited<ReturnType<typeof createWorkspace>>} */
  let workspace;
  /** @type {Awaited<ReturnType<typeof launchIde>>} */
  let ide;

  test.beforeAll(async () => {
    workspace = await createWorkspace({
      "format-me.js": "const value={answer:42};\nfunction read(){return value.answer;}\n",
    });
    ide = await launchIde(workspace.root);
    await openProject(ide.window);
  });

  test.afterAll(async () => {
    await ide?.close();
    await workspace?.dispose();
  });

  test("oferece a ação genérica e delega a formatação ao plugin JavaScript", async () => {
    const { window } = ide;
    await window.evaluate(() => {
      const content = "const value={answer:42};\nfunction read(){return value.answer;}\n";
      const file = new File([content], "format-me.js", { type: "text/javascript" });
      const handle = {
        kind: "file",
        name: "format-me.js",
        async getFile() { return file; },
        async createWritable() {
          return { async write() {}, async close() {}, async abort() {} };
        },
      };
      Object.defineProperty(window, "showOpenFilePicker", {
        configurable: true,
        value: async () => [handle],
      });
    });
    await window.getByText("Abrir arquivo", { exact: true }).first().click();
    const editor = window.locator("textarea.code-editor");
    await expect(editor).toHaveValue("const value={answer:42};\nfunction read(){return value.answer;}\n", { timeout: 20_000 });

    await window.getByRole("button", { name: /^Editar/ }).click();
    const formatAction = window.getByText("Formatar documento", { exact: true });
    await expect(formatAction).toBeVisible({ timeout: 10_000 });
    await formatAction.click();

    await expect(editor).toHaveValue("const value = { answer: 42 };\nfunction read() { return value.answer; }\n", { timeout: 20_000 });
  });
});
