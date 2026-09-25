import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { activateAllPlugins, createWorkspace, launchIde, openFile, openProject } from "./ide-app.mjs";

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
  /** @type {string[]} */
  let startupConflictResponses;

  test.beforeAll(async () => {
    const explorerLoad = Object.fromEntries(
      Array.from({ length: 12 }, (_, directoryIndex) => (
        Array.from({ length: 20 }, (_, fileIndex) => [
          `fixtures/group-${String(directoryIndex).padStart(2, "0")}/file-${String(fileIndex).padStart(2, "0")}.txt`,
          `fixture ${directoryIndex}/${fileIndex}\n`,
        ])
      )).flat(),
    );
    workspace = await createWorkspace({
      "src/alvo.py": "MARCADOR_UNICO = 'texto procurado'\n",
      "notas.md": "# Notas\n\nlinha de markdown\n",
      ...explorerLoad,
    });
    // Repositório real: o plugin de git precisa de algo para relatar.
    execFileSync("git", ["init", "-q"], { cwd: workspace.root });
    execFileSync("git", ["config", "user.email", "e2e@tinyide.local"], { cwd: workspace.root });
    execFileSync("git", ["config", "user.name", "E2E"], { cwd: workspace.root });
    ide = await launchIde(workspace.root);
    startupConflictResponses = [];
    ide.window.on("response", (response) => {
      if (response.status() === 409 && response.url().includes("/plugin-api/")) {
        startupConflictResponses.push(response.url());
      }
    });
    await openProject(ide.window);
  });

  test.afterAll(async () => {
    await ide?.close();
    await workspace?.dispose();
  });

  test("todos os plugins ativam e nenhum reporta falha na barra de atividades", async () => {
    const { window } = ide;
    await expect(window.getByText(/plugin\(s\)/)).toContainText(/\d+ plugin\(s\)/);
    expect(startupConflictResponses, "plugins não devem consultar o runtime antes do workspace ficar pronto").toEqual([]);

    // Um plugin que falha ao ativar deixa a mensagem no rótulo do seu botão.
    const failures = await window.evaluate(() => [...document.querySelectorAll("[aria-label], [title]")]
      .map((element) => element.getAttribute("aria-label") ?? element.getAttribute("title") ?? "")
      .filter((label) => /falha|failed|erro:/i.test(label)));
    expect(failures, `rótulos com falha: ${failures.join(" | ")}`).toEqual([]);

    // O benchmark desta suíte só é válido com o conjunto inteiro ativo. A
    // contagem no status inclui instalados desativados, então confirma o estado
    // real pelo gerenciador antes dos testes de interação.
    const installedCount = await activateAllPlugins(window);
    expect(installedCount).toBeGreaterThan(0);
    console.log(`[medida] plugins ativos: ${installedCount}`);
  });

  test("as ferramentas de cada plugin estão acessíveis na barra de atividades", async () => {
    const { window } = ide;
    for (const label of ["Exibir Git", "Exibir Docker", "Exibir Banco de dados", "Exibir TERMINAL", "Exibir Node.js"]) {
      await expect(window.getByLabel(label).first(), `${label} deveria estar disponível`).toBeVisible();
    }
    await expect(window.getByLabel("Busca indexada")).toBeVisible();
    await expect(window.getByLabel("Ambientes de execução")).toBeVisible();
  });

  test("botões de ferramenta expõem e alternam o estado aberto de forma acessível", async () => {
    const { window } = ide;
    for (const name of ["Git", "Docker", "Banco de dados", "TERMINAL", "Node.js"]) {
      const closed = window.locator(`button[aria-label^="Exibir ${name}"]`).first();
      await expect(closed).toHaveAttribute("aria-pressed", "false");
      await closed.click();
      const opened = window.locator(`button[aria-label^="Ocultar ${name}"]`).first();
      await expect(opened).toHaveAttribute("aria-pressed", "true");
      await opened.click();
      await expect(window.locator(`button[aria-label^="Exibir ${name}"]`).first()).toHaveAttribute("aria-pressed", "false");
    }
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

  test("a mensagem de commit sobrevive a sair e voltar ao painel de alterações", async () => {
    const { window } = ide;
    await window.getByLabel("Alterações").first().click();
    const message = window.getByLabel("Mensagem do commit", { exact: true }).first();
    await message.waitFor({ timeout: 30_000 });
    await message.fill("commit em rascunho");

    // A superfície oculta é desmontada para não deixar timers e consultas de plugin rodando em
    // segundo plano; o que o usuário escreveu não pode ir junto.
    await window.getByLabel("Explorador").first().click();
    await expect(window.getByLabel("Mensagem do commit", { exact: true })).toHaveCount(0);

    await window.getByLabel("Alterações").first().click();
    const restored = window.getByLabel("Mensagem do commit", { exact: true }).first();
    await restored.waitFor({ timeout: 30_000 });
    await expect(restored).toHaveValue("commit em rascunho");
    await restored.fill("");
    await window.getByLabel("Explorador").first().click();
  });

  test("digitação não degrada com Explorer expandido nem recalcula gitignore por tecla", async () => {
    const { window } = ide;
    const openGitToolWindow = window.locator('button[aria-label^="Ocultar Git"]').first();
    if (await openGitToolWindow.isVisible().catch(() => false)) {
      await openGitToolWindow.click();
      await expect(window.locator('button[aria-label^="Exibir Git"]').first()).toHaveAttribute("aria-pressed", "false");
    }
    const ignoredPayloadSizes = [];
    const ignoredRequests = [];
    const gitRefreshRequests = [];
    const onRequest = (request) => {
      const url = request.url();
      if (/\/plugin-api\/tinyide\.git\/(?:status|branches|submodules|remotes)(?:\?|$)/.test(url)) {
        gitRefreshRequests.push(url);
      }
      if (!url.includes("/plugin-api/tinyide.git/ignored")) return;
      ignoredRequests.push(url);
      try {
        const body = request.postDataJSON();
        ignoredPayloadSizes.push(Array.isArray(body?.paths) ? body.paths.length : 0);
      } catch {
        ignoredPayloadSizes.push(-1);
      }
    };
    window.on("request", onRequest);
    try {
      // Materializa uma árvore grande no estado do Explorer. O host deve consultar
      // apenas os caminhos recém-descobertos, e não toda a árvore a cada expansão.
      await window.locator('[data-explorer-path="fixtures"]').click();
      for (let index = 0; index < 12; index += 1) {
        const group = `fixtures/group-${String(index).padStart(2, "0")}`;
        await window.locator(`[data-explorer-path="${group}"]`).click();
        await expect(window.locator(`[data-explorer-path="${group}/file-19.txt"]`)).toBeVisible();
      }
      await window.waitForTimeout(500);
      expect(ignoredPayloadSizes.length).toBeGreaterThan(0);

      ignoredRequests.length = 0;
      ignoredPayloadSizes.length = 0;
      await openFile(window, "src/alvo.py");
      const editor = window.locator("textarea.code-editor");
      await editor.click();
      await editor.press("Control+End");
      // Abrir/revelar o arquivo pode descobrir novos caminhos do Explorer e
      // legitimamente consultar ignore uma vez. A medição abaixo é exclusiva
      // do caminho quente de digitação.
      await window.waitForTimeout(100);
      ignoredRequests.length = 0;
      ignoredPayloadSizes.length = 0;
      gitRefreshRequests.length = 0;

      // Medido dentro da página: o relógio do automatizador conta também o ida e volta do
      // protocolo por tecla, que numa máquina carregada supera o custo real do editor.
      await window.evaluate(() => {
        window.__typingLatency = [];
        window.addEventListener("keydown", () => {
          const startedAt = performance.now();
          requestAnimationFrame(() => requestAnimationFrame(() => {
            window.__typingLatency.push(performance.now() - startedAt);
          }));
        }, true);
      });
      await editor.pressSequentially("\nINTERACAO_PERFORMANCE = 'abcdefghijklmnopqrstuvwxyz'\n");
      await expect(editor).toHaveValue(/INTERACAO_PERFORMANCE/);
      await window.waitForTimeout(300);
      const latency = await window.evaluate(() => {
        const samples = [...window.__typingLatency].sort((left, right) => left - right);
        return samples[Math.floor(samples.length / 2)] ?? 0;
      });

      expect(ignoredRequests, "editar um buffer não pode disparar git check-ignore").toEqual([]);
      const gitRequestsByRoute = Object.groupBy(
        gitRefreshRequests,
        (url) => new URL(url).pathname.split("/").at(-1),
      );
      console.log(
        `[medida] requests Git durante digitação: ${JSON.stringify(Object.fromEntries(
          Object.entries(gitRequestsByRoute).map(([route, requests]) => [route, requests?.length ?? 0]),
        ))}`,
      );
      expect(
        gitRequestsByRoute.branches?.length ?? 0,
        "digitar não pode provocar refresh repetido de branches",
      ).toBeLessThanOrEqual(1);
      expect(gitRequestsByRoute.submodules?.length ?? 0).toBeLessThanOrEqual(1);
      expect(gitRequestsByRoute.remotes?.length ?? 0).toBeLessThanOrEqual(1);
      // Um /status adicional é esperado quando o documento fica dirty: a
      // decoração do próprio arquivo precisa descobrir seu estado Git.
      expect(gitRequestsByRoute.status?.length ?? 0).toBeLessThanOrEqual(2);
      console.log(
        `[medida] todos os plugins: ${latency.toFixed(0)}ms/tecla; requests Git durante digitação: ${gitRefreshRequests.length}`,
      );
      expect(latency, `${latency.toFixed(0)}ms por tecla com o Explorer expandido`).toBeLessThan(120);
    } finally {
      window.off("request", onRequest);
    }
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

    // O grid ocupa o host até sobrar menos de uma célula: sobra maior indica
    // que o fit voltou a reservar espaço (a scrollbar escondida custava 14px
    // e deixava uma faixa morta à direita das TUIs). E nenhum invólucro do
    // painel pode exibir scrollbar própria — TUIs desenham a delas.
    const geometry = await window.evaluate(() => {
      const host = document.querySelector(".tinyide-terminal-xterm");
      const screen = host.querySelector(".xterm-screen");
      const slack = host.getBoundingClientRect().right - screen.getBoundingClientRect().right;
      const scrollbars = [...document.querySelector(".tinyide-terminal-panel").querySelectorAll("*")]
        .filter((el) => {
          const style = getComputedStyle(el);
          const scrollable = /auto|scroll/.test(style.overflowY + style.overflowX);
          return scrollable && (el.offsetWidth - el.clientWidth > 0 || el.offsetHeight - el.clientHeight > 0);
        })
        .map((el) => el.className);
      return { slack, scrollbars };
    });
    expect(geometry.slack).toBeLessThanOrEqual(8);
    expect(geometry.scrollbars).toEqual([]);
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

  test("titlebar continua utilizável ao reduzir a janela com todos os plugins ativos", async () => {
    const { window } = ide;
    const original = await window.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    try {
      await window.setViewportSize({ width: 820, height: 600 });
      await expect(window.getByLabel("Perfil de execução")).toBeVisible();
      await expect(window.getByLabel("Gerenciar perfis")).toBeVisible();
      await expect(window.getByLabel("Recarregar página")).toBeVisible();
      await expect.poll(() => window.evaluate(() => ({
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
        titlebar: Math.ceil(document.querySelector(".titlebar")?.getBoundingClientRect().right ?? 0),
      }))).toEqual({ viewport: 820, document: 820, titlebar: 820 });
    } finally {
      await window.setViewportSize(original);
    }
  });
});
