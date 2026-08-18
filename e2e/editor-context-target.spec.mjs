import { expect, test } from "@playwright/test";
import { createWorkspace, launchIde, openFile, openProject } from "./ide-app.mjs";

/**
 * O menu de contexto do editor age sobre a palavra sob o ponteiro ("Encontrar usos",
 * "Executar com pytest"), mas sem realce nada indica qual é ela. Aqui o alvo precisa
 * aparecer pintado enquanto o menu está aberto e sumir quando ele fecha.
 */
test.describe("alvo do menu de contexto do editor", () => {
  /** @type {Awaited<ReturnType<typeof createWorkspace>>} */
  let workspace;
  /** @type {Awaited<ReturnType<typeof launchIde>>} */
  let ide;

  test.beforeAll(async () => {
    workspace = await createWorkspace({
      "src/alvos.py": "magalu_config_default = 1\nmeli_config_default = 2\n",
    });
    ide = await launchIde(workspace.root);
    await openProject(ide.window);
  });

  test.afterAll(async () => {
    await ide?.close();
    await workspace?.dispose();
  });

  test("realça a palavra sob o ponteiro enquanto o menu está aberto", async () => {
    const { window } = ide;
    await openFile(window, "src/alvos.py");
    const editor = window.locator("textarea.code-editor");
    await expect(editor).toHaveValue(/magalu_config_default/, { timeout: 20_000 });

    // Ponto sobre o identificador da primeira linha, e não sobre a margem.
    const box = await editor.boundingBox();
    await editor.click({ position: { x: 40, y: box.height > 20 ? 10 : 5 } });
    await editor.click({ button: "right", position: { x: 40, y: box.height > 20 ? 10 : 5 } });

    const target = window.locator(".editor-context-target");
    await expect(target.first()).toBeVisible({ timeout: 10_000 });
    await expect(target.first()).toHaveText("magalu_config_default");

    // O menu fecha com um clique fora dele, e o realce sai junto.
    await editor.click({ position: { x: 200, y: box.height > 20 ? 10 : 5 } });
    await expect(window.locator(".editor-context-target")).toHaveCount(0);
  });
});
