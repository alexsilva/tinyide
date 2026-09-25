import { _electron as electron } from "@playwright/test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Workspace descartável com um pouco de tudo que a IDE precisa reconhecer: código,
 * texto, um arquivo dentro de subdiretório e um binário que a indexação deve ignorar.
 */
/**
 * Perfil de execução equivalente ao que a IDE grava quando o usuário cria uma
 * configuração de execução pela interface.
 */
export function executionProfile({ name, executable, parameters, workingDirectory }) {
  const id = `e2e.${name.replace(/\W+/g, "-")}`;
  return {
    id,
    name,
    environment: { mode: "none" },
    saveBeforeRun: true,
    steps: [{
      id: `${id}:step-1`,
      name,
      executable,
      command: "",
      parameters,
      workingDirectory,
    }],
  };
}

/**
 * Ambiente Python do tipo `process`: um interpretador solto, sem venv. É o vínculo que
 * o adaptador de depuração exige — sem ambiente do provedor Python, depurar fica
 * indisponível mesmo que o perfil aponte para um interpretador.
 */
export function pythonEnvironment(executable, id = "env-e2e-python") {
  return { id, name: "python de teste", type: "process", executable };
}

export async function createWorkspace(files, options = {}) {
  const baseDir = options.baseDir ?? tmpdir();
  await mkdir(baseDir, { recursive: true });
  const root = await mkdtemp(join(baseDir, "tinyide-e2e-"));
  const defaults = {
    "README.md": "# Projeto de fumaça\n\nConteúdo inicial.\n",
    "src/main.py": 'def cumprimentar(nome):\n    return f"olá {nome}"\n\n\nprint(cumprimentar("mundo"))\n',
    "src/util.py": "ALVO_DE_BUSCA = 42\n",
  };
  for (const [path, content] of Object.entries({ ...defaults, ...files })) {
    const absolute = join(root, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, content, "utf8");
  }
  return {
    root,
    file: (path) => join(root, path),
    /** Grava configurações do workspace antes de a IDE subir. */
    async writeSettings(settings) {
      const path = join(root, ".tinyide", "settings.json");
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify({ version: 1, ...settings }, undefined, 2)}\n`, "utf8");
    },
    /** Registra ambientes Python como o plugin faria ao importar um interpretador. */
    async writePythonEnvironments(environments) {
      const path = join(root, ".tinyide", "environments", "python-registry.json");
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(environments, undefined, 2)}\n`, "utf8");
    },
    async dispose() {
      await rm(root, { recursive: true, force: true });
    },
  };
}

/**
 * Sobe a IDE apontada para um workspace e devolve a janela pronta para interação.
 * O workspace vem por `TINYIDE_WORKSPACE`, o mesmo caminho que o desktop usa para
 * reabrir o último projeto.
 */
/**
 * `options.pickerPath` troca o diretório que o seletor nativo devolve, o que
 * permite abrir um segundo projeto na mesma execução; `options.userDataDir`
 * reaproveita o estado de um lançamento anterior (recentes, ponteiro do host).
 */
export async function launchIde(workspaceRoot, options = {}) {
  // Estado isolado por execução: um teste não pode herdar sessão, plugins ou abas
  // deixadas por outro.
  const userDataDir = options.userDataDir ?? await mkdtemp(join(tmpdir(), "tinyide-e2e-state-"));
  const application = await electron.launch({
    // A raiz do projeto, e não o arquivo do processo principal: é assim que o app
    // resolve `getAppPath()` para achar runtime, plugins e a interface compilada.
    args: [
      repositoryRoot,
      "--no-sandbox",
      "--disable-gpu",
      `--user-data-dir=${userDataDir}`,
      // Ambientes sem sessão gráfica própria (Xvfb, CI) precisam apontar a
      // plataforma do Chromium à mão: `TINYIDE_E2E_ELECTRON_ARGS=--ozone-platform=x11`.
      ...(process.env.TINYIDE_E2E_ELECTRON_ARGS?.split(" ").filter(Boolean) ?? []),
    ],
    cwd: repositoryRoot,
    env: {
      ...process.env,
      ...(options.env ?? {}),
      // O renderer continua com geometria normal e sem throttling, mas a
      // BrowserWindow fica transparente e fora da taskbar.
      TINYIDE_E2E_HEADLESS: options.headless === false ? "0" : "1",
      TINYIDE_WORKSPACE: workspaceRoot,
      TINYIDE_WORKSPACES_ROOT: dirname(workspaceRoot),
      // Os workspaces E2E vivem em <repo>/.tmp. Sem um teto explícito, Git
      // sobe até o próprio repositório do TinyIDE e herda seu .git/info/exclude,
      // fazendo todos os recursos do fixture parecerem ignorados. O teto mantém
      // cada fixture isolado, mas ainda permite repositórios criados DENTRO dele.
      GIT_CEILING_DIRECTORIES: [process.env.GIT_CEILING_DIRECTORIES, dirname(workspaceRoot)]
        .filter(Boolean)
        .join(delimiter),
      // Gancho já existente no processo principal: dispensa o seletor nativo de
      // diretório, que o teste não conseguiria operar.
      TINYIDE_TEST_WORKSPACE_PICKER_PATH: options.pickerPath ?? workspaceRoot,
    },
    timeout: 60_000,
  });
  const window = await application.firstWindow();
  await window.waitForLoadState("domcontentloaded");
  return {
    application,
    window,
    async close() {
      await application.close().catch(() => undefined);
    },
  };
}

/**
 * Abre o seletor de projeto pelo caminho real da interface: o dropdown "Projeto" da
 * tela de boas-vindas, seu item "Abrir projeto" e o diálogo de seleção.
 */
export async function openProjectPicker(window) {
  await window.locator(".welcome-actions").getByRole("button", { name: /^Projeto/ }).click();
  await window.getByRole("menuitem", { name: "Abrir projeto" }).click();
  const currentTarget = window.getByRole("radio", { name: "Tela atual" });
  if (await currentTarget.isVisible().catch(() => false)) await currentTarget.check();
  await window.getByText("Escolher outro projeto", { exact: true }).click();
}

/**
 * Percorre o caminho real de abertura de projeto: tela de boas-vindas, diálogo e
 * seleção. Retorna quando o Explorer já lista o conteúdo do workspace.
 */
export async function openProject(window) {
  const readme = window.getByText("README.md", { exact: true }).first();
  const expandRoot = window.getByRole("button", { name: "Expandir próximo nível" }).first();
  try {
    if (await expandRoot.isVisible({ timeout: 10_000 }).catch(() => false)) await expandRoot.click();
    await readme.waitFor({ timeout: 10_000 });
    return;
  } catch {
    // Sem workspace inicial/restaurável: aí sim percorre o fluxo do seletor.
  }
  await openProjectPicker(window);
  if (await readme.count() === 0) {
    if (await expandRoot.isVisible().catch(() => false)) await expandRoot.click();
  }
  await readme.waitFor({ timeout: 45_000 });
}

/**
 * Ativa todo plugin instalado no perfil isolado do E2E. Alguns plugins
 * opcionais (como Pytest) são instalados mas começam desativados; benchmarks de
 * fan-out precisam incluí-los para representar o pior caso do host.
 */
export async function activateAllPlugins(window) {
  await window.getByLabel("Plugins").first().click();
  const installedCards = window.locator(".plugin-card:not(.available)");
  const installedCount = await installedCards.count();
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const activate = installedCards.getByRole("button", { name: "Ativar", exact: true }).first();
    if (await activate.count() === 0) break;
    await activate.click();
    await activate.waitFor({ state: "detached", timeout: 15_000 }).catch(() => undefined);
  }
  const activeCount = await installedCards.getByRole("button", { name: "Desativar", exact: true }).count();
  if (activeCount !== installedCount) {
    throw new Error(`Esperava ${installedCount} plugins ativos, mas encontrei ${activeCount}.`);
  }
  if (await window.locator(".plugin-card.available").count() !== 0) {
    throw new Error("O catálogo contém plugins empacotados que não foram instalados.");
  }
  await window.getByLabel("Explorador").first().click();
  return installedCount;
}

/**
 * Abre um arquivo pelo Explorer. Um clique apenas seleciona; abrir exige duplo clique,
 * e diretórios intermediários precisam ser expandidos antes.
 */
export async function openFile(window, path) {
  const segments = path.split("/");
  const name = segments.pop();
  for (const directory of segments) {
    const node = window.getByText(directory, { exact: true }).first();
    await node.waitFor({ timeout: 20_000 });
    if ((await window.getByText(name, { exact: true }).count()) === 0) await node.click();
  }
  const target = window.getByText(name, { exact: true }).first();
  await target.waitFor({ timeout: 20_000 });
  await target.dblclick();
}
