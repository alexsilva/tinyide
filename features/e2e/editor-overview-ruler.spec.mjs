import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { activateAllPlugins, createWorkspace, launchIde, openFile, openProject } from "./ide-app.mjs";

/**
 * A faixa de visão geral é do host e as marcas vêm de um plugin (o Git), pelo contrato público
 * de decorações de linha. Este teste exercita a composição inteira: um arquivo versionado com
 * alterações longe do topo, as marcas na faixa e o clique levando o editor até o bloco.
 */
test.describe("faixa de visão geral do editor", () => {
  /** @type {Awaited<ReturnType<typeof createWorkspace>>} */
  let workspace;
  /** @type {Awaited<ReturnType<typeof launchIde>>} */
  let ide;
  const original = Array.from({ length: 300 }, (_, index) => `linha_${String(index + 1).padStart(3, "0")} = ${index + 1}`);
  // Remove a 40, insere três linhas depois da 120 e altera a 250: um bloco de cada tipo.
  const changed = [
    ...original.slice(0, 39),
    ...original.slice(40, 120),
    "inserida_a = 1",
    "inserida_b = 2",
    "inserida_c = 3",
    ...original.slice(120, 249),
    "linha_250 = 'alterada'",
    ...original.slice(250),
  ];
  const modifiedLine = changed.indexOf("linha_250 = 'alterada'") + 1;

  test.beforeAll(async () => {
    workspace = await createWorkspace({
      "src/longo.py": `${original.join("\n")}\n`,
      "src/limpo.py": "valor = 1\n",
    });
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

  test("marca os blocos alterados e o clique leva o editor até o bloco", async () => {
    const { window } = ide;
    await openFile(window, "src/longo.py");
    await expect(window.locator("textarea.code-editor")).toHaveValue(/inserida_a/, { timeout: 20_000 });

    const ruler = window.locator(".editor-overview-ruler");
    const marks = ruler.locator(".editor-overview-ruler__mark");
    await expect(marks).toHaveCount(3, { timeout: 30_000 });
    await expect(ruler.locator(".is-deleted")).toHaveCount(1);
    await expect(ruler.locator(".is-added")).toHaveAttribute("aria-label", /linhas 120-122/);
    const modified = ruler.locator(".is-modified");
    await expect(modified).toHaveAttribute("aria-label", new RegExp(`linha ${modifiedLine}`));

    // A faixa fica à direita da área rolável do editor, e cada marca na altura proporcional.
    const canvasBox = await window.locator(".editor-canvas").boundingBox();
    const rulerBox = await ruler.boundingBox();
    const markBox = await modified.boundingBox();
    expect(canvasBox && rulerBox && markBox).toBeTruthy();
    if (!canvasBox || !rulerBox || !markBox) return;
    expect(Math.round(rulerBox.x + rulerBox.width)).toBe(Math.round(canvasBox.x + canvasBox.width));
    const lineCount = changed.length + 1;
    expect(Math.abs((markBox.y - rulerBox.y) / rulerBox.height - (modifiedLine - 1) / lineCount)).toBeLessThan(0.01);

    // Antes do clique o bloco está fora da tela; depois, a linha alterada fica visível no editor.
    const modifiedGutterLine = window.locator(".editor-line-ruler__line.has-modified");
    await expect(modifiedGutterLine).toHaveCount(0);
    // O clique não precisa acertar a barra: alguns pixels abaixo dela, no vão da faixa, ainda a alcança.
    const below = { x: markBox.x + markBox.width / 2, y: markBox.y + markBox.height + 6 };
    await window.mouse.move(below.x, below.y);
    await expect(modified).toHaveClass(/is-hot/);
    await expect(ruler).toHaveClass(/is-pointing/);
    await window.mouse.click(below.x, below.y);
    await expect(modifiedGutterLine.first()).toBeInViewport({ timeout: 10_000 });
    const caretLine = await window.locator("textarea.code-editor").evaluate((element) => (
      /** @type {HTMLTextAreaElement} */ (element).value.slice(0, /** @type {HTMLTextAreaElement} */ (element).selectionStart).split("\n").length
    ));
    expect(caretLine).toBe(modifiedLine);
  });

  test("a alça do painel direito não encosta na faixa e ainda redimensiona", async () => {
    const { window } = ide;
    await openFile(window, "src/longo.py");
    await expect(window.locator(".editor-overview-ruler__mark")).toHaveCount(3, { timeout: 30_000 });
    // Qualquer painel à direita usa a mesma alça; o de Problemas vive na barra direita por padrão.
    const sidebar = window.locator(".problems-panel:not(.problems-panel--left)");
    if (!(await sidebar.isVisible())) await window.getByRole("button", { name: /^Problemas/ }).click();
    await expect(sidebar).toBeVisible({ timeout: 10_000 });

    const rulerBox = await window.locator(".editor-overview-ruler").boundingBox();
    const sidebarBox = await sidebar.boundingBox();
    expect(rulerBox && sidebarBox).toBeTruthy();
    if (!rulerBox || !sidebarBox) return;
    const y = rulerBox.y + rulerBox.height / 2;
    const handleAt = (/** @type {number} */ x) => window.evaluate(([px, py]) => (
      Boolean(document.elementFromPoint(px, py)?.closest(".resize-handle"))
    ), [x, y]);
    // Logo à direita da faixa há folga inerte; o agarre começa sobre a borda do painel.
    const rulerRight = Math.round(rulerBox.x + rulerBox.width);
    for (const offset of [0, 1, 2]) expect(await handleAt(rulerRight + offset)).toBe(false);
    expect(await handleAt(sidebarBox.x + 1)).toBe(true);

    await window.mouse.move(sidebarBox.x + 1, y);
    await window.mouse.down();
    await window.mouse.move(sidebarBox.x - 39, y, { steps: 4 });
    await window.mouse.up();
    await expect.poll(async () => (await sidebar.boundingBox())?.width ?? 0).toBeGreaterThan(sidebarBox.width + 30);
  });

  test("arquivo versionado sem alteração não reserva a faixa", async () => {
    const { window } = ide;
    await openFile(window, "src/longo.py");
    await expect(window.locator(".editor-overview-ruler__mark")).toHaveCount(3, { timeout: 30_000 });
    await openFile(window, "src/limpo.py");
    await expect(window.locator("textarea.code-editor")).toHaveValue("valor = 1\n", { timeout: 20_000 });
    await expect(window.locator(".editor-overview-ruler")).toHaveCount(0, { timeout: 10_000 });
    await expect(window.locator(".editor-canvas")).not.toHaveClass(/has-overview-ruler/);
  });
});
