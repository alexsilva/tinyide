import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { createWorkspace, launchIde, openFile, openProject } from "./ide-app.mjs";

test.describe("aviso de arquivo atualizado externamente", () => {
  /** @type {Awaited<ReturnType<typeof createWorkspace>>} */
  let workspace;
  /** @type {Awaited<ReturnType<typeof launchIde>>} */
  let ide;

  test.beforeAll(async () => {
    workspace = await createWorkspace({});
    ide = await launchIde(workspace.root);
    await openProject(ide.window);
  });

  test.afterAll(async () => {
    await ide?.close();
    await workspace?.dispose();
  });

  test("fecha por um ícone sem caixa e explica a ação no tooltip", async () => {
    const { window } = ide;
    await openFile(window, "src/main.py");
    const editor = window.locator("textarea.code-editor");
    await expect(editor).toHaveValue(/cumprimentar/);

    await writeFile(workspace.file("src/main.py"), "VALOR_ATUALIZADO_EXTERNAMENTE = 42\n", "utf8");
    await expect(editor).toHaveValue(/VALOR_ATUALIZADO_EXTERNAMENTE/, { timeout: 20_000 });

    const notice = window.locator('[data-external-file-notice="reloaded"]');
    await expect(notice).toBeVisible();
    const close = notice.getByRole("button", { name: "Fechar aviso" });
    await expect(close).toBeVisible();
    await expect(close.locator("svg")).toHaveCount(1);

    const appearance = await close.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        backgroundColor: style.backgroundColor,
        borderTopWidth: style.borderTopWidth,
        borderRightWidth: style.borderRightWidth,
        borderBottomWidth: style.borderBottomWidth,
        borderLeftWidth: style.borderLeftWidth,
      };
    });
    expect(appearance).toEqual({
      backgroundColor: "rgba(0, 0, 0, 0)",
      borderTopWidth: "0px",
      borderRightWidth: "0px",
      borderBottomWidth: "0px",
      borderLeftWidth: "0px",
    });

    await close.hover();
    await expect(window.getByRole("tooltip")).toHaveText("Fechar aviso");
    await close.click();
    await expect(notice).toHaveCount(0);
  });
});
