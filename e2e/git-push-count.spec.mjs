import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWorkspace, launchIde, openProject } from "./ide-app.mjs";

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

/**
 * O contador do botão de push é a única indicação de que existe trabalho a
 * enviar. Ele precisa aparecer nos dois regimes: com upstream, onde o número
 * vem de `# branch.ab`, e em branch local sem upstream, onde o git não emite
 * esse cabeçalho e a contagem tem que sair dos commits que nenhum remoto tem.
 */
test("contador do botão de push cobre branch com e sem upstream", async () => {
  const workspace = await createWorkspace();
  const remote = join(await mkdtemp(join(tmpdir(), "tinyide-remote-")), "root.git");
  git(workspace.root, "init", "-b", "main");
  git(workspace.root, "config", "user.name", "Tiny IDE E2E");
  git(workspace.root, "config", "user.email", "e2e@example.test");
  git(workspace.root, "add", ".");
  git(workspace.root, "commit", "-m", "inicial");
  execFileSync("git", ["init", "--bare", "-b", "main", remote]);
  git(workspace.root, "remote", "add", "origin", remote);
  git(workspace.root, "push", "-u", "origin", "main");
  git(workspace.root, "commit", "--allow-empty", "-m", "pendente 1");
  git(workspace.root, "commit", "--allow-empty", "-m", "pendente 2");

  const ide = await launchIde(workspace.root);
  try {
    await openProject(ide.window);
    await ide.window.locator('[data-activity-key="sidebar:git.changes"] button').click();
    const panel = ide.window.locator('[data-sidebar-id="git.changes"] .tinyide-git--changes').first();
    await panel.waitFor({ timeout: 45_000 });
    // Segundo botão da barra: pull, push, atualizar, mais ações.
    const pushButton = panel.locator(".tinyide-git__toolbar-button").nth(1);
    const badge = pushButton.locator(".tinyide-git__count");

    await expect.poll(() => pushButton.getAttribute("data-count"), { timeout: 30_000 }).toBe("2");
    await expect(badge).toHaveText("2");
    await expect(badge).toBeVisible();

    // Branch local recém-criada: sem upstream, `git status` não informa `ahead`.
    git(workspace.root, "checkout", "-b", "trabalho-local");
    git(workspace.root, "commit", "--allow-empty", "-m", "pendente 3");
    await expect.poll(() => pushButton.getAttribute("data-count"), { timeout: 30_000 }).toBe("3");
    await expect(badge).toHaveText("3");
    await expect(pushButton).toHaveAttribute("title", /3 commit\(s\) local\(is\)/);
  } finally {
    await ide.close();
    await workspace.dispose();
  }
});
