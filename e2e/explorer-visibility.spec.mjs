import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createWorkspace, launchIde, openProject } from "./ide-app.mjs";

test.describe("visibilidade do Explorer", () => {
  /** @type {Awaited<ReturnType<typeof createWorkspace>>} */
  let workspace;
  /** @type {Awaited<ReturnType<typeof launchIde>>} */
  let ide;

  test.beforeAll(async () => {
    workspace = await createWorkspace({
      ".hidden-e2e": "oculto\n",
      ".gitignore": "ignored-e2e.txt\n",
      "ignored-e2e.txt": "ignorado\n",
      "visible-e2e.txt": "visível\n",
    });
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

  async function openExplorerActions() {
    await ide.window.getByLabel("Ações do Explorer").click();
  }

  test("um único item alterna arquivos ocultos do Explorer e ignorados pelo Git", async () => {
    const { window } = ide;
    await expect(window.getByText("visible-e2e.txt", { exact: true })).toBeVisible();
    await expect(window.getByText(".hidden-e2e", { exact: true })).toHaveCount(0);
    await expect(window.getByText("ignored-e2e.txt", { exact: true })).toHaveCount(0);

    await openExplorerActions();
    await expect(window.getByRole("menuitem", { name: "Exibir arquivos ocultos" })).toBeVisible();
    await expect(window.getByRole("menuitem", { name: "Exibir arquivos ignorados" })).toHaveCount(0);
    await expect(window.getByRole("menuitem", { name: "Ocultar arquivos ignorados" })).toHaveCount(0);
    await window.getByRole("menuitem", { name: "Exibir arquivos ocultos" }).click();
    await expect(window.getByText(".hidden-e2e", { exact: true })).toBeVisible();
    await expect(window.getByText("ignored-e2e.txt", { exact: true })).toBeVisible();

    await openExplorerActions();
    await expect(window.getByRole("menuitem", { name: "Ocultar arquivos ignorados" })).toBeVisible();
    await expect(window.getByRole("menuitem", { name: "Exibir arquivos ocultos" })).toHaveCount(0);
    await expect(window.getByRole("menuitem", { name: "Ocultar arquivos ocultos" })).toHaveCount(0);
    await window.getByRole("menuitem", { name: "Ocultar arquivos ignorados" }).click();
    await expect(window.getByText(".hidden-e2e", { exact: true })).toHaveCount(0);
    await expect(window.getByText("ignored-e2e.txt", { exact: true })).toHaveCount(0);

    await openExplorerActions();
    await expect(window.getByRole("menuitem", { name: "Exibir arquivos ocultos" })).toBeVisible();
    await expect(window.getByRole("menuitem", { name: /arquivos ignorados/i })).toHaveCount(0);
  });
});
