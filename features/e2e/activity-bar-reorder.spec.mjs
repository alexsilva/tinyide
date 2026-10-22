import { expect, test } from "@playwright/test";
import { createWorkspace, launchIde, openProject } from "./ide-app.mjs";

/**
 * A activity bar reordena por pointer events, nunca por arrasto nativo. Um
 * `draggable` transforma qualquer clique com 3px de movimento numa sessão de
 * arrasto do sistema; em 2026-10-22 uma dessas sessões terminou sem o Chromium
 * avisar o renderer e a janela passou a ignorar cliques e teclas (o Blink
 * descarta toda entrada enquanto acredita estar arrastando). Este spec garante
 * que o gesto inteiro fica na página: nenhum `dragstart` nasce da barra, o
 * clique continua abrindo o painel e o arrasto reordena.
 */
test.describe("reordenação da activity bar", () => {
  /** @type {Awaited<ReturnType<typeof createWorkspace>>} */
  let workspace;
  /** @type {Awaited<ReturnType<typeof launchIde>>} */
  let ide;

  test.beforeAll(async () => {
    workspace = await createWorkspace({ "README.md": "# reorder\n" });
    ide = await launchIde(workspace.root);
    await openProject(ide.window);
  });

  test.afterAll(async () => {
    await ide?.close();
    await workspace?.dispose();
  });

  async function leftBarKeys(window) {
    return window.locator(".activity-bar [data-activity-key]").evaluateAll((slots) => (
      slots.map((slot) => slot.getAttribute("data-activity-key"))
    ));
  }

  test("clique abre o painel, arrasto reordena e nenhum arrasto nativo é iniciado", async () => {
    const { window } = ide;
    await window.evaluate(() => {
      const counters = { dragstart: 0, dragend: 0 };
      window.addEventListener("dragstart", () => { counters.dragstart += 1; }, true);
      window.addEventListener("dragend", () => { counters.dragend += 1; }, true);
      Object.assign(window, { __tinyideDragCounters: counters });
    });

    const bar = window.locator(".activity-bar");
    await expect(bar.locator("[draggable]")).toHaveCount(0);

    const terminalSlot = bar.locator("[data-activity-key='toolWindow:terminal']");
    await expect(terminalSlot).toBeVisible();
    const terminalButton = terminalSlot.getByRole("button");
    await expect(terminalButton).toHaveAttribute("aria-label", "Exibir TERMINAL");

    // Um clique ligeiramente trêmulo continua sendo clique.
    const box = await terminalSlot.boundingBox();
    if (!box) throw new Error("slot do terminal sem geometria");
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    await window.mouse.move(centerX, centerY);
    await window.mouse.down();
    await window.mouse.move(centerX + 2, centerY + 2, { steps: 2 });
    await window.mouse.up();
    await expect(terminalButton).toHaveAttribute("aria-label", "Ocultar TERMINAL");
    await expect(bar.locator(".is-dragging")).toHaveCount(0);

    // Arrastar o terminal para cima de um slot anterior reordena a barra.
    const before = await leftBarKeys(window);
    const terminalIndex = before.indexOf("toolWindow:terminal");
    expect(terminalIndex).toBeGreaterThan(0);
    const targetKey = before[0];
    const targetSlot = bar.locator(`[data-activity-key='${targetKey}']`);
    const targetBox = await targetSlot.boundingBox();
    if (!targetBox) throw new Error("slot alvo sem geometria");
    await window.mouse.move(centerX, centerY);
    await window.mouse.down();
    await window.mouse.move(centerX, centerY - 20, { steps: 4 });
    await expect(terminalSlot).toHaveClass(/is-dragging/);
    await window.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 4, { steps: 6 });
    await expect(targetSlot).toHaveClass(/is-drop-before/);
    await window.mouse.up();

    await expect(bar.locator(".is-dragging")).toHaveCount(0);
    await expect(bar.locator(".is-drop-before, .is-drop-after")).toHaveCount(0);
    await expect.poll(() => leftBarKeys(window)).toEqual([
      "toolWindow:terminal",
      ...before.filter((key) => key !== "toolWindow:terminal"),
    ]);
    // Soltar não é clique: o painel não mudou de estado.
    await expect(terminalButton).toHaveAttribute("aria-label", "Ocultar TERMINAL");

    // Esc cancela o arrasto e a soltura seguinte não aciona o botão.
    await window.mouse.move(centerX, targetBox.y + targetBox.height / 2);
    await window.mouse.down();
    await window.mouse.move(centerX, targetBox.y + targetBox.height / 2 + 60, { steps: 4 });
    await expect(terminalSlot).toHaveClass(/is-dragging/);
    await window.keyboard.press("Escape");
    await expect(bar.locator(".is-dragging")).toHaveCount(0);
    await window.mouse.up();
    await expect(terminalButton).toHaveAttribute("aria-label", "Ocultar TERMINAL");
    expect(await leftBarKeys(window)).toEqual([
      "toolWindow:terminal",
      ...before.filter((key) => key !== "toolWindow:terminal"),
    ]);

    expect(await window.evaluate(() => window.__tinyideDragCounters)).toEqual({ dragstart: 0, dragend: 0 });
  });
});
