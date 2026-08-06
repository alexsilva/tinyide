import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createWorkspace, launchIde, openFile, openProject } from "./ide-app.mjs";

/**
 * Os plugins não vivem isolados: dividem o event loop do runtime, a barra de atividades,
 * o editor e o mesmo workspace. Este arquivo verifica o conjunto em funcionamento —
 * todos ativos, sem falha visível, e cada um cumprindo seu papel com os demais em pé.
 */
test.describe("conjunto de plugins", () => {
  /** @type {Awaited<ReturnType<typeof createWorkspace>>} */
  let workspace;
  /** @type {Awaited<ReturnType<typeof launchIde>>} */
  let ide;

  test.beforeAll(async () => {
    workspace = await createWorkspace({
      "src/alvo.py": "MARCADOR_UNICO = 'texto procurado'\n",
      "notas.md": "# Notas\n\nlinha de markdown\n",
    });
    // Repositório real: o plugin de git precisa de algo para relatar.
    execFileSync("git", ["init", "-q"], { cwd: workspace.root });
    execFileSync("git", ["config", "user.email", "e2e@tinyide.local"], { cwd: workspace.root });
    execFileSync("git", ["config", "user.name", "E2E"], { cwd: workspace.root });
    ide = await launchIde(workspace.root);
    await openProject(ide.window);
  });

  test.afterAll(async () => {
    await ide?.close();
    await workspace?.dispose();
  });

  test("todos os plugins ativam e nenhum reporta falha na barra de atividades", async () => {
    const { window } = ide;
    await expect(window.getByText(/plugin\(s\)/)).toContainText(/\d+ plugin\(s\)/);

    // Um plugin que falha ao ativar deixa a mensagem no rótulo do seu botão.
    const failures = await window.evaluate(() => [...document.querySelectorAll("[aria-label], [title]")]
      .map((element) => element.getAttribute("aria-label") ?? element.getAttribute("title") ?? "")
      .filter((label) => /falha|failed|erro:/i.test(label)));
    expect(failures, `rótulos com falha: ${failures.join(" | ")}`).toEqual([]);
  });

  test("as ferramentas de cada plugin estão acessíveis na barra de atividades", async () => {
    const { window } = ide;
    for (const label of ["Exibir Git", "Exibir Docker", "Exibir Banco de dados", "Exibir TERMINAL", "Exibir Node.js"]) {
      await expect(window.getByLabel(label).first(), `${label} deveria estar disponível`).toBeVisible();
    }
    await expect(window.getByLabel("Busca indexada")).toBeVisible();
    await expect(window.getByLabel("Ambientes de execução")).toBeVisible();
  });

  test("busca encontra o arquivo e o editor abre no resultado", async () => {
    const { window } = ide;
    await window.getByLabel("Busca indexada").click();
    const input = window.locator(".tinyide-search__input");
    await input.waitFor({ timeout: 20_000 });
    await input.fill("MARCADOR_UNICO");
    // O resultado vem da busca (um plugin) e a abertura é do host, no editor.
    const result = window.locator(".tinyide-search__row, .tinyide-search__file").first();
    await result.waitFor({ timeout: 30_000 });
    await result.click();
    await expect(window.locator("textarea.code-editor")).toHaveValue(/MARCADOR_UNICO/, { timeout: 20_000 });
  });

  test("git reconhece o repositório e lista o arquivo do workspace", async () => {
    const { window } = ide;
    await window.getByLabel("Exibir Git").first().click();
    // O painel do plugin relata o estado do repositório criado para o teste.
    await expect(window.getByText(/alvo\.py|Alterações|src/).first()).toBeVisible({ timeout: 30_000 });
  });

  test("terminal abre e executa um comando no workspace", async () => {
    const { window } = ide;
    await window.getByLabel("Exibir TERMINAL").first().click();
    const terminal = window.locator(".xterm-screen").first();
    await terminal.waitFor({ timeout: 30_000 });
    // O shell precisa ter desenhado algo antes de receber teclas, e o foco tem de
    // estar nele: sem isso a digitação vai para o editor.
    await expect.poll(
      () => terminal.innerText(),
      { timeout: 30_000, message: "o terminal deveria desenhar o prompt" },
    ).not.toBe("");
    await terminal.click();
    await window.keyboard.type("echo tinyide-terminal-ok");
    await window.keyboard.press("Enter");
    await expect.poll(
      () => terminal.innerText(),
      { timeout: 30_000, message: "a saída do comando deveria aparecer no terminal" },
    ).toMatch(/tinyide-terminal-ok/);
  });

  test("banco de dados abre o painel de conexões", async () => {
    const { window } = ide;
    await window.getByLabel("Exibir Banco de dados").first().click();
    // Pelo painel do plugin, e não por texto: outros painéis abertos disputam os
    // mesmos rótulos.
    const panel = window.locator(".tinyide-db").first();
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await expect(panel).toContainText("Nova conexão");
    await expect(panel).toContainText(/Nenhuma conexão cadastrada/);
  });

  test("markdown e código convivem em abas, cada um com seu renderizador", async () => {
    const { window } = ide;
    await openFile(window, "notas.md");
    await expect(window.getByText("linha de markdown")).toBeVisible({ timeout: 20_000 });
    await expect(window.locator("textarea.code-editor")).toHaveCount(0);

    await openFile(window, "src/alvo.py");
    await expect(window.locator("textarea.code-editor")).toHaveValue(/MARCADOR_UNICO/, { timeout: 20_000 });
  });

  test("o editor continua respondendo depois de acionar todos os plugins", async () => {
    const { window } = ide;
    await openFile(window, "src/alvo.py");
    const editor = window.locator("textarea.code-editor");
    await editor.click();
    await editor.press("Control+End");
    await editor.type("\nDEPOIS_DOS_PLUGINS = 1\n");
    await expect(editor).toHaveValue(/DEPOIS_DOS_PLUGINS/);
  });
});
