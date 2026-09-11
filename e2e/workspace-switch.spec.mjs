import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { createWorkspace, launchIde, openProjectPicker } from "./ide-app.mjs";

const run = promisify(execFile);

/** Deixa o diretório como um repositório real, na branch informada. */
async function initRepository(root, branch) {
  const git = (...args) => run("git", args, {
    cwd: root,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "tinyIde",
      GIT_AUTHOR_EMAIL: "e2e@tinyide.test",
      GIT_COMMITTER_NAME: "tinyIde",
      GIT_COMMITTER_EMAIL: "e2e@tinyide.test",
    },
  });
  await git("init", "--initial-branch", branch);
  await git("add", ".");
  await git("commit", "--no-gpg-sign", "-m", "estado inicial");
}

/**
 * Trocar de projeto pela lista de recentes é o caminho que mais quebrou até
 * aqui: o runtime do app empacotado só aceita caminhos que o processo principal
 * já registrou, e o registro acontece ao restaurar o handle do diretório. Quem
 * pedir a troca ao runtime antes de restaurar o handle recebe "O workspace
 * salvo não está disponível dentro da raiz configurada para workspaces" e a
 * janela fica presa no projeto anterior.
 */
test.describe("troca de workspace no app empacotado", () => {
  /** @type {Awaited<ReturnType<typeof createWorkspace>>} */
  let projectA;
  /** @type {Awaited<ReturnType<typeof createWorkspace>>} */
  let projectB;
  /** @type {string} */
  let userDataDir;

  test.beforeAll(async () => {
    projectA = await createWorkspace({ "somente-em-a.txt": "a\n" });
    projectB = await createWorkspace({ "somente-em-b.txt": "b\n" });
    userDataDir = await mkdtemp(join(tmpdir(), "tinyide-e2e-state-"));
  });

  test.afterAll(async () => {
    await projectA?.dispose();
    await projectB?.dispose();
  });

  /** O menu "Projeto" da barra de título, distinto do dropdown da tela de boas-vindas. */
  function projectMenu(window) {
    return window.locator(".titlebar").getByRole("button", { name: /^Projeto/ });
  }

  test("abrir um projeto recente na tela atual troca o workspace", async () => {
    // Primeira execução: abre A pelo seletor, o que o registra nos recentes.
    const first = await launchIde(projectA.root, { userDataDir, pickerPath: projectA.root });
    await openProjectPicker(first.window);
    await expect(first.window.getByText("somente-em-a.txt", { exact: true })).toBeVisible({ timeout: 45_000 });
    await first.close();

    // Segunda execução, mesmo estado: abre B e depois volta para A pelo menu de
    // recentes, na tela atual — o cenário relatado.
    const second = await launchIde(projectB.root, { userDataDir, pickerPath: projectB.root });
    try {
      await openProjectPicker(second.window);
      await expect(second.window.getByText("somente-em-b.txt", { exact: true })).toBeVisible({ timeout: 45_000 });

      await projectMenu(second.window).click();
      await second.window.getByRole("menuitem", { name: new RegExp(basename(projectA.root)) }).click();

      await expect(second.window.getByText("somente-em-a.txt", { exact: true })).toBeVisible({ timeout: 45_000 });
      await expect(second.window.getByText(/não está disponível dentro da raiz/)).toHaveCount(0);
      await expect(second.window.getByText("somente-em-b.txt", { exact: true })).toHaveCount(0);
    } finally {
      await second.close();
    }
  });

  /**
   * Abrir outro projeto em uma janela nova não é trocar de projeto: a janela que
   * operou o diálogo continua no projeto dela. Enquanto o processo principal
   * tratava a escolha como troca, ele transferia a posse do workspace e liberava
   * o projeto ainda exibido — a janela de origem perdia o watcher e qualquer
   * leitura falhava com "O workspace desktop não está mais registrado".
   */
  test("abrir um projeto em outra janela mantém o projeto da janela atual utilizável", async () => {
    const windowState = await mkdtemp(join(tmpdir(), "tinyide-e2e-janela-"));

    // Registra A nos recentes: é por ele que a janela de origem abre adiante.
    const bootstrap = await launchIde(projectA.root, { userDataDir: windowState, pickerPath: projectA.root });
    await openProjectPicker(bootstrap.window);
    await expect(bootstrap.window.getByText("somente-em-a.txt", { exact: true })).toBeVisible({ timeout: 45_000 });
    await bootstrap.close();

    // O seletor agora devolve B: é o projeto que vai abrir na janela nova.
    const ide = await launchIde(projectA.root, { userDataDir: windowState, pickerPath: projectB.root });
    try {
      // A janela de origem abre A pelos recentes: o seletor desta execução
      // devolve B, que é o projeto reservado para a janela nova.
      await ide.window.locator(".welcome-actions").getByRole("button", { name: /^Projeto/ }).click();
      await ide.window.getByRole("menuitem", { name: "Abrir projeto" }).click();
      await ide.window.locator(".project-open-recent__main")
        .filter({ hasText: basename(projectA.root) })
        .click();
      await expect(ide.window.getByText("somente-em-a.txt", { exact: true })).toBeVisible({ timeout: 45_000 });

      await projectMenu(ide.window).click();
      await ide.window.getByRole("menuitem", { name: "Abrir projeto" }).click();
      await ide.window.getByText("Nova janela", { exact: true }).click();
      const openedWindow = ide.application.waitForEvent("window");
      await ide.window.getByText("Escolher outro projeto", { exact: true }).click();

      const second = await openedWindow;
      await second.waitForLoadState("domcontentloaded");
      await expect(second.getByText("somente-em-b.txt", { exact: true })).toBeVisible({ timeout: 45_000 });

      // Um arquivo criado agora só aparece se a janela de origem ainda conseguir
      // ler o disco do projeto dela: com o token invalidado, o Explorer ficava
      // congelado no conteúdo antigo e o erro subia em toda operação.
      await writeFile(projectA.file("criado-com-a-janela-nova.txt"), "novo\n", "utf8");
      await ide.window.getByLabel("Ações do Explorer").click();
      await ide.window.getByRole("menuitem", { name: "Atualizar" }).click();
      await expect(ide.window.getByText("criado-com-a-janela-nova.txt", { exact: true }))
        .toBeVisible({ timeout: 30_000 });
      await expect(ide.window.getByText(/não está mais registrado/)).toHaveCount(0);
    } finally {
      await ide.close();
    }
  });

  /**
   * A barra do Git roda quatro requisições por atualização e ainda tem um timer
   * de 15s. Antes, uma resposta do projeto anterior chegando depois da troca era
   * aplicada como se fosse do novo: a branch exibida oscilava entre os dois
   * projetos. Este teste observa a barra durante um intervalo, e não apenas o
   * estado final — o defeito era justamente transitório.
   */
  test("a barra do Git para na branch do novo workspace, sem voltar à anterior", async () => {
    await initRepository(projectA.root, "branch-do-a");
    await initRepository(projectB.root, "branch-do-b");
    const gitState = await mkdtemp(join(tmpdir(), "tinyide-e2e-git-"));

    const first = await launchIde(projectA.root, { userDataDir: gitState, pickerPath: projectA.root });
    await openProjectPicker(first.window);
    await expect(first.window.getByText("somente-em-a.txt", { exact: true })).toBeVisible({ timeout: 45_000 });
    await first.close();

    const second = await launchIde(projectB.root, { userDataDir: gitState, pickerPath: projectB.root });
    try {
      const branchLabel = second.window.locator(".tinyide-git-titlebar__branch-label");
      await openProjectPicker(second.window);
      await expect(branchLabel).toHaveText("branch-do-b", { timeout: 45_000 });

      // Em repositórios reais, `git status` leva o suficiente para a resposta
      // atravessar a troca de projeto. Aqui o atraso é explícito: sem ele o
      // teste dependeria de vencer uma corrida de milissegundos.
      const scopeB = new URL(second.window.url()).pathname.split("/")[2];
      await second.window.route(`**/w/${scopeB}/plugin-api/**`, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 4_000));
        await route.continue().catch(() => undefined);
      });

      await projectMenu(second.window).click();
      await second.window.getByRole("menuitem", { name: new RegExp(basename(projectA.root)) }).click();
      await expect(branchLabel).toHaveText("branch-do-a", { timeout: 45_000 });

      const observed = new Set();
      for (let sample = 0; sample < 40; sample += 1) {
        observed.add((await branchLabel.textContent())?.trim() ?? "");
        await second.window.waitForTimeout(250);
      }
      expect([...observed]).toEqual(["branch-do-a"]);
    } finally {
      await second.close();
    }
  });

  /**
   * Terminais pertencem ao projeto. Enquanto a troca de workspace não avisava o
   * runtime de que a janela tinha saído do projeto anterior, os PTYs — e tudo o
   * que rodava dentro deles — continuavam vivos sem nenhuma janela para
   * controlá-los.
   */
  test("os processos do terminal do projeto anterior são encerrados na troca", async () => {
    const terminalState = await mkdtemp(join(tmpdir(), "tinyide-e2e-term-"));
    const pidFile = projectB.file("terminal.pid");

    // Registra A nos recentes: é por ele que a troca acontece mais adiante.
    const bootstrap = await launchIde(projectA.root, { userDataDir: terminalState, pickerPath: projectA.root });
    await openProjectPicker(bootstrap.window);
    await expect(bootstrap.window.getByText("somente-em-a.txt", { exact: true })).toBeVisible({ timeout: 45_000 });
    await bootstrap.close();

    const ide = await launchIde(projectB.root, { userDataDir: terminalState, pickerPath: projectB.root });
    try {
      await openProjectPicker(ide.window);
      await expect(ide.window.getByText("somente-em-b.txt", { exact: true })).toBeVisible({ timeout: 45_000 });

      await ide.window.getByLabel("Exibir TERMINAL").first().click();
      const terminal = ide.window.locator(".xterm-screen").first();
      await terminal.waitFor({ timeout: 30_000 });
      await expect.poll(() => terminal.innerText(), { timeout: 30_000 }).not.toBe("");
      await terminal.click();
      // Um processo filho de vida longa: é o que não podia sobreviver à troca.
      await ide.window.keyboard.type(`sh -c 'echo $$ > ${pidFile}; sleep 600' &`);
      await ide.window.keyboard.press("Enter");

      let pid = 0;
      await expect.poll(async () => {
        pid = Number((await readFile(pidFile, "utf8").catch(() => "0")).trim());
        return pid;
      }, { timeout: 30_000 }).toBeGreaterThan(0);
      expect(() => process.kill(pid, 0)).not.toThrow();

      await projectMenu(ide.window).click();
      await ide.window.getByRole("menuitem", { name: new RegExp(basename(projectA.root)) }).click();
      await expect(ide.window.getByText("somente-em-a.txt", { exact: true })).toBeVisible({ timeout: 45_000 });

      await expect.poll(() => {
        try {
          process.kill(pid, 0);
          return "vivo";
        } catch {
          return "encerrado";
        }
      }, { timeout: 30_000, message: "o processo do terminal do projeto anterior deveria ter sido encerrado" })
        .toBe("encerrado");
    } finally {
      await ide.close();
    }
  });
});
