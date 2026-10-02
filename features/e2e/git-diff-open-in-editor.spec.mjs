import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { activateAllPlugins, createWorkspace, launchIde, openFile, openProject } from "./ide-app.mjs";

/**
 * O dialog de diff do plugin Git dá acesso direto ao arquivo: "Abrir no editor" abre o arquivo
 * na alteração que o diff mostrava, pelo contrato `workspace.openResource`, e fecha o dialog.
 */
test.describe("diff do Git: abrir no editor", () => {
  /** @type {Awaited<ReturnType<typeof createWorkspace>>} */
  let workspace;
  /** @type {Awaited<ReturnType<typeof launchIde>>} */
  let ide;
  const original = Array.from({ length: 200 }, (_, index) => `linha_${String(index + 1).padStart(3, "0")} = ${index + 1}`);
  // Altera a 5 (visível ao abrir) e insere duas linhas depois da 120: o segundo bloco começa na 121.
  const changed = [
    ...original.slice(0, 4),
    "linha_005 = 'alterada'",
    ...original.slice(5, 120),
    "inserida_a = 1",
    "inserida_b = 2",
    ...original.slice(120),
  ];
  const insertedLine = changed.indexOf("inserida_a = 1") + 1;

  test.beforeAll(async () => {
    workspace = await createWorkspace({ "src/longo.py": `${original.join("\n")}\n` });
    for (const args of [
      ["init", "-q"],
      ["config", "user.email", "e2e@tinyide.local"],
      ["config", "user.name", "E2E"],
      ["add", "-A"],
      ["commit", "-q", "-m", "base"],
    ]) {
      execFileSync("git", args, { cwd: workspace.root });
    }
    await writeFile(workspace.file("src/longo.py"), `${changed.join("\n")}\n`, "utf8");
    ide = await launchIde(workspace.root);
    await openProject(ide.window);
    await activateAllPlugins(ide.window);
  });

  test.afterAll(async () => {
    await ide?.close();
    await workspace?.dispose();
  });

  test("abre o arquivo na alteração ativa do diff e fecha o dialog", async () => {
    const { window } = ide;
    await openFile(window, "src/longo.py");
    const editor = window.locator("textarea.code-editor");
    await expect(editor).toHaveValue(/inserida_a/, { timeout: 20_000 });

    const marker = window.locator(".editor-line-ruler__line.has-modified .editor-line-ruler__marker").first();
    await expect(marker).toBeVisible({ timeout: 30_000 });
    await marker.hover();
    await window.locator(".editor-line-diff-peek").getByRole("button", { name: "Diff completo" }).click();

    const diff = window.locator(".tinyide-git-diff");
    await expect(diff).toBeVisible({ timeout: 20_000 });
    // O botão fica logo à direita do "desfazer", no fim da barra.
    const toolbarTitles = await diff.locator(".tinyide-git-diff__toolbar > button").evaluateAll((buttons) => (
      buttons.slice(-2).map((button) => button.getAttribute("title"))
    ));
    expect(toolbarTitles).toEqual(["Desfazer todas as alterações deste arquivo", "Abrir no editor"]);
    const openButton = diff.getByRole("button", { name: "Abrir no editor" });
    await expect(openButton.locator("svg")).toHaveCSS("fill", "none");

    await diff.getByRole("button", { name: "Próxima alteração" }).click();
    await expect(diff.locator(".tinyide-git-diff__statusbar")).toContainText("Alteração 2 de 2");
    await openButton.click();

    await expect(diff).toHaveCount(0, { timeout: 10_000 });
    await expect(editor).toBeFocused();
    const caretLine = await editor.evaluate((element) => (
      /** @type {HTMLTextAreaElement} */ (element).value.slice(0, /** @type {HTMLTextAreaElement} */ (element).selectionStart).split("\n").length
    ));
    expect(caretLine).toBe(insertedLine);
    await expect(window.locator(".editor-line-ruler__line.has-added").first()).toBeInViewport({ timeout: 10_000 });
  });
});
