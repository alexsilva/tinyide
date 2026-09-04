import { expect, test } from "@playwright/test";
import { createWorkspace, launchIde } from "./ide-app.mjs";

/**
 * Painéis em janelas reais do sistema — só no app empacotado. O contrato dos
 * plugins não muda: o host decide a apresentação, e o mesmo mount que enche um
 * dock enche uma BrowserWindow dedicada carregando o mesmo workspace.
 */
test.describe("painéis em janelas do sistema", () => {
  /** @type {Awaited<ReturnType<typeof createWorkspace>>} */
  let project;

  test.beforeAll(async () => {
    project = await createWorkspace({});
  });

  test.afterAll(async () => {
    await project?.dispose();
  });

  async function openProject(window) {
    await window.getByText("Abrir projeto", { exact: true }).first().click();
    await window.getByText("Escolher outro projeto", { exact: true }).click();
    await expect(window.getByText("README.md", { exact: true })).toBeVisible({ timeout: 45_000 });
  }

  test("destaca o terminal para uma janela própria e foca a existente na segunda vez", async () => {
    const ide = await launchIde(project.root, { pickerPath: project.root });
    try {
      await openProject(ide.window);

      await ide.window.getByLabel("Exibir TERMINAL").first().click();
      const dockedTerminal = ide.window.locator(".xterm-screen").first();
      await dockedTerminal.waitFor({ timeout: 30_000 });

      const panelWindowEvent = ide.application.waitForEvent("window");
      await ide.window.getByLabel("Abrir TERMINAL em janela separada").click();
      const panelWindow = await panelWindowEvent;
      await panelWindow.waitForLoadState("domcontentloaded");

      // A janela apresenta só o terminal, com título próprio, e o PTY funciona:
      // o comando digitado nela ecoa de volta na mesma tela.
      const panelTerminal = panelWindow.locator(".panel-window-shell .xterm-screen").first();
      await panelTerminal.waitFor({ timeout: 45_000 });
      await expect.poll(() => panelWindow.title(), { timeout: 30_000 }).toContain("TERMINAL");
      await expect.poll(() => panelTerminal.innerText(), { timeout: 30_000 }).not.toBe("");
      await panelTerminal.click();
      await panelWindow.keyboard.type("echo tinyide-panel-ok");
      await panelWindow.keyboard.press("Enter");
      await expect.poll(() => panelTerminal.innerText(), { timeout: 30_000 }).toContain("tinyide-panel-ok");

      // O PTY é redimensionado para a janela destacada (1040px, mais estreita
      // que o dock da principal): registra as colunas para comparar no reanexo.
      await panelWindow.keyboard.type("echo wincols:$(tput cols)");
      await panelWindow.keyboard.press("Enter");
      let panelWindowColumns = 0;
      await expect.poll(async () => {
        panelWindowColumns = Number((await panelTerminal.innerText()).match(/wincols:(\d+)/)?.[1] ?? 0);
        return panelWindowColumns;
      }, { timeout: 30_000 }).toBeGreaterThan(0);

      // Destacar recolhe o dock e desmonta o host na janela principal: um host
      // oculto seria um segundo cliente do mesmo PTY, com dimensões divergentes
      // da janela destacada — é o que quebrava a TUI ao reanexar.
      await expect(ide.window.locator(".tool-window-panel:not(.tool-window-panel--hidden)")).toHaveCount(0);
      await expect(ide.window.locator('[data-tool-window-id="terminal"]')).toHaveCount(0);

      // Pedir o mesmo painel de novo foca a janela existente em vez de duplicar.
      await ide.window.getByLabel("Exibir TERMINAL").first().click();
      await ide.window.getByLabel("Abrir TERMINAL em janela separada").click();
      await ide.window.waitForTimeout(1_500);
      expect(ide.application.windows()).toHaveLength(2);
      await expect(ide.window.locator('[data-tool-window-id="terminal"]')).toHaveCount(0);

      // Reanexar fecha a janela auxiliar e devolve a superfície ao dock da origem.
      await panelWindow.getByLabel("Reanexar TERMINAL à janela principal").click();
      await expect.poll(() => ide.application.windows().length, { timeout: 15_000 }).toBe(1);
      const reattachedTerminal = ide.window
        .locator('[data-tool-window-id="terminal"] .xterm-screen')
        .first();
      await expect(reattachedTerminal).toBeVisible({ timeout: 30_000 });

      // O dock remonta reconectando à mesma sessão: o replay devolve o que foi
      // digitado na janela e o PTY continua aceitando entrada.
      await expect.poll(() => reattachedTerminal.innerText(), { timeout: 30_000 }).toContain("tinyide-panel-ok");
      await reattachedTerminal.click();
      await ide.window.keyboard.type("echo tinyide-reattach-ok");
      await ide.window.keyboard.press("Enter");
      await expect.poll(() => reattachedTerminal.innerText(), { timeout: 30_000 }).toContain("tinyide-reattach-ok");

      // A causa raiz da TUI quebrada: o reanexo reaproveitava o host retido e o
      // cache de dimensões suprimia o resize, deixando o PTY com as colunas da
      // janela destacada (sem SIGWINCH, TUIs não redesenham). Remontado, o dock
      // impõe as próprias colunas ao PTY.
      await ide.window.keyboard.type("echo dockcols:$(tput cols)");
      await ide.window.keyboard.press("Enter");
      let dockColumns = 0;
      await expect.poll(async () => {
        dockColumns = Number((await reattachedTerminal.innerText()).match(/dockcols:(\d+)/)?.[1] ?? 0);
        return dockColumns;
      }, { timeout: 30_000 }).toBeGreaterThan(0);
      expect(dockColumns).not.toBe(panelWindowColumns);
    } finally {
      await ide.close();
    }
  });

  test("destaca a sidebar de alterações do Git para uma janela própria", async () => {
    const ide = await launchIde(project.root, { pickerPath: project.root });
    try {
      await openProject(ide.window);

      await ide.window.getByLabel("Alterações", { exact: true }).first().click();
      await ide.window.locator(".tinyide-git--changes").first().waitFor({ timeout: 45_000 });

      const panelWindowEvent = ide.application.waitForEvent("window");
      await ide.window.getByLabel("Abrir Alterações em janela separada").click();
      const panelWindow = await panelWindowEvent;
      await panelWindow.waitForLoadState("domcontentloaded");

      // O mesmo mount do plugin, agora dentro da janela dedicada.
      await panelWindow.locator(".panel-window-shell .tinyide-git--changes").first().waitFor({ timeout: 45_000 });
      await expect.poll(() => panelWindow.title(), { timeout: 30_000 }).toContain("Alterações");

      // O destaque fecha a sidebar da janela principal.
      await expect(ide.window.locator(".plugin-sidebar-host")).toHaveCount(0);

      // Reanexar reapresenta a sidebar na janela principal e fecha a auxiliar.
      await panelWindow.getByLabel("Reanexar Alterações à janela principal").click();
      await expect.poll(() => ide.application.windows().length, { timeout: 15_000 }).toBe(1);
      await ide.window.locator(".plugin-sidebar-host .tinyide-git--changes").first().waitFor({ timeout: 45_000 });

      const closeOnlyPanelWindowEvent = ide.application.waitForEvent("window");
      await ide.window.getByLabel("Abrir Alterações em janela separada").click();
      const closeOnlyPanelWindow = await closeOnlyPanelWindowEvent;
      await closeOnlyPanelWindow.waitForLoadState("domcontentloaded");
      await closeOnlyPanelWindow.locator(".panel-window-shell .tinyide-git--changes").first().waitFor({ timeout: 45_000 });

      // O botão de fechar da superfície fecha a janela do SO.
      await closeOnlyPanelWindow.getByLabel("Fechar janela de Alterações").click();
      await expect.poll(() => ide.application.windows().length, { timeout: 15_000 }).toBe(1);
    } finally {
      await ide.close();
    }
  });
});
