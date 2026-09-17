import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createWorkspace, launchIde, openFile, openProject } from "./ide-app.mjs";

/**
 * Fumaça do caminho percorrido todo dia: abrir o projeto, ler e editar código, salvar,
 * visualizar um recurso renderizado por plugin e localizar texto. A suíte unitária não
 * cobre nada disso — é aqui que aparece uma IDE quebrada com todos os testes verdes.
 */
test.describe("IDE em uso", () => {
  /** @type {Awaited<ReturnType<typeof createWorkspace>>} */
  let workspace;
  /** @type {Awaited<ReturnType<typeof launchIde>>} */
  let ide;

  test.beforeAll(async () => {
    workspace = await createWorkspace();
    ide = await launchIde(workspace.root);
  });

  test.afterAll(async () => {
    await ide?.close();
    await workspace?.dispose();
  });

  test("abre a janela com a interface e os plugins carregados", async () => {
    const { window } = ide;
    expect(await window.title()).toContain("tinyIde");
    await expect(window.getByText("EXPLORER")).toBeVisible();
    await expect(window.getByText(/plugin\(s\)/)).toBeVisible();
  });

  test("abre o projeto e lista o conteúdo do workspace", async () => {
    const { window } = ide;
    await openProject(window);
    await expect(window.getByText("README.md", { exact: true }).first()).toBeVisible();
    await expect(window.getByText("src", { exact: true }).first()).toBeVisible();
  });

  test("abre um arquivo de código no editor", async () => {
    const { window } = ide;
    await openFile(window, "src/main.py");
    const editor = window.locator("textarea.code-editor");
    await expect(editor).toBeVisible();
    await expect(editor).toHaveValue(/def cumprimentar/);
  });

  test("edita e salva, e a mudança chega ao disco", async () => {
    const { window } = ide;
    await openFile(window, "src/main.py");
    const editor = window.locator("textarea.code-editor");
    await editor.click();
    await editor.press("Control+End");
    await editor.type("\nMARCA_DO_TESTE = 1\n");
    await editor.press("Control+s");

    await expect.poll(
      () => readFile(workspace.file("src/main.py"), "utf8"),
      { timeout: 20_000, message: "o conteúdo digitado deveria ter sido gravado" },
    ).toContain("MARCA_DO_TESTE = 1");
  });

  test("renderiza markdown pela visualização do plugin", async () => {
    const { window } = ide;
    await openFile(window, "README.md");
    // O provedor de editor do plugin assume o lugar do editor de texto.
    await expect(window.getByText("Projeto de fumaça")).toBeVisible();
    await expect(window.locator("textarea.code-editor")).toHaveCount(0);
  });

  test("encontra código pela busca indexada", async () => {
    const { window } = ide;
    await window.getByLabel("Busca indexada").click();
    const input = window.locator(".tinyide-search__input");
    await input.waitFor({ timeout: 20_000 });
    await input.fill("ALVO_DE_BUSCA");
    await expect(window.getByText("util.py").first()).toBeVisible({ timeout: 30_000 });
    await window.keyboard.press("Escape");
  });
});
