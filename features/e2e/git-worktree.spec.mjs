import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createWorkspace, launchIde, openProject } from "./ide-app.mjs";

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

/**
 * Um worktree linkado é um workspace de primeira classe: `.git` ali é um
 * arquivo, o gitdir mora no repositório principal, e nada disso pode vazar
 * para o usuário. O teste abre a IDE direto no worktree, confere branch e
 * mudanças, e cria um segundo worktree pelo fluxo novo da UI, abrindo-o em
 * outra janela.
 */
test("worktree é workspace de primeira classe e a UI cria e abre um novo", async () => {
  const workspace = await createWorkspace();
  git(workspace.root, "init", "-b", "main");
  git(workspace.root, "config", "user.name", "Tiny IDE E2E");
  git(workspace.root, "config", "user.email", "e2e@example.test");
  git(workspace.root, "add", ".");
  git(workspace.root, "commit", "-m", "inicial");
  const fixWorktree = `${workspace.root}-fix`;
  git(workspace.root, "worktree", "add", "-b", "fix/urgente", fixWorktree);
  await writeFile(join(fixWorktree, "src", "util.py"), "ALVO_DE_BUSCA = 43\n", "utf8");
  // A main avança um commit para o ponto de partida do worktree novo ficar
  // distinguível da branch atual (fix/urgente segue no commit inicial).
  await writeFile(join(workspace.root, "NOTAS.md"), "avanço só na main\n", "utf8");
  git(workspace.root, "add", "NOTAS.md");
  git(workspace.root, "commit", "-m", "avança main");

  const ide = await launchIde(fixWorktree);
  try {
    await openProject(ide.window);

    // A titlebar precisa mostrar a branch do worktree, não a do principal.
    const branchButton = ide.window.locator(".tinyide-git-titlebar__branch");
    await expect(branchButton.locator(".tinyide-git-titlebar__branch-label"))
      .toHaveText("fix/urgente", { timeout: 45_000 });

    // O painel de mudanças enxerga a edição feita dentro do worktree.
    await ide.window.locator('[data-activity-key="sidebar:git.changes"] button').click();
    const panel = ide.window.locator('[data-sidebar-id="git.changes"] .tinyide-git--changes').first();
    await panel.waitFor({ timeout: 45_000 });
    await expect(panel.getByText("util.py").first()).toBeVisible({ timeout: 30_000 });

    // O menu de branches ganha a seção Worktrees com o principal e o atual.
    await branchButton.click();
    await expect(ide.window.locator(".tinyide-git-menu__header", { hasText: /^Worktrees \(2\)$/ }))
      .toBeVisible({ timeout: 15_000 });
    const createItem = ide.window.locator(".tinyide-git-menu__item", { hasText: "Criar novo worktree" });
    await expect(createItem).toBeVisible();

    // Fluxo de criação: branch nova a partir da main — não da branch atual do
    // workspace —, escolhida na lista do campo de ponto de partida.
    await createItem.click();
    const dialog = ide.window.locator(".tinyide-git-dialog");
    await dialog.waitFor({ timeout: 15_000 });
    const branchInput = dialog.locator("#tinyide-git-worktree-branch");
    const startInput = dialog.locator("#tinyide-git-worktree-start");
    // O ponto de partida só existe para branch nova: oculto até digitar um nome.
    await expect(startInput).toBeHidden();
    await branchInput.fill("hotfix/e2e");
    await expect(startInput).toBeVisible();
    await expect(startInput).toHaveValue("fix/urgente");
    await branchInput.press("Tab");
    await dialog.locator("#tinyide-git-worktree-start-options [role='option']", { hasText: /^main$/ })
      .click({ timeout: 15_000 });
    await expect(startInput).toHaveValue("main");
    const createdPath = `${fixWorktree}-hotfix-e2e`;
    await expect(dialog.locator("label", { hasText: "Pasta do worktree" }).locator("input"))
      .toHaveValue(createdPath);
    await ide.window.getByRole("button", { name: "Criar worktree" }).click();

    // Depois de criar, a IDE oferece abrir — em nova janela vira outra
    // BrowserWindow com o workspace do worktree novo.
    const openInNewWindow = ide.window.getByRole("button", { name: "Abrir em nova janela" });
    await expect(openInNewWindow).toBeVisible({ timeout: 45_000 });
    const secondWindowPromise = ide.application.waitForEvent("window", { timeout: 45_000 });
    await openInNewWindow.click();
    const secondWindow = await secondWindowPromise;
    await secondWindow.waitForLoadState("domcontentloaded");
    await secondWindow.getByText("README.md", { exact: true }).first().waitFor({ timeout: 45_000 });

    // O registro no repositório confirma o worktree e a branch criados — e o
    // ponto de partida foi a main escolhida na lista, não a branch atual.
    const registered = git(workspace.root, "worktree", "list", "--porcelain");
    expect(registered).toContain(`worktree ${createdPath}`);
    expect(registered).toContain("branch refs/heads/hotfix/e2e");
    const createdHead = git(workspace.root, "rev-parse", "hotfix/e2e").trim();
    expect(createdHead).toBe(git(workspace.root, "rev-parse", "main").trim());
    expect(createdHead).not.toBe(git(workspace.root, "rev-parse", "fix/urgente").trim());
  } finally {
    await ide.close();
    await rm(`${fixWorktree}-hotfix-e2e`, { recursive: true, force: true });
    await rm(fixWorktree, { recursive: true, force: true });
    await workspace.dispose();
  }
});
