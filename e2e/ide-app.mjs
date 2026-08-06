import { _electron as electron } from "@playwright/test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Workspace descartável com um pouco de tudo que a IDE precisa reconhecer: código,
 * texto, um arquivo dentro de subdiretório e um binário que a indexação deve ignorar.
 */
export async function createWorkspace(files) {
  const root = await mkdtemp(join(tmpdir(), "tinyide-e2e-"));
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
    ],
    cwd: repositoryRoot,
    env: {
      ...process.env,
      TINYIDE_WORKSPACE: workspaceRoot,
      TINYIDE_WORKSPACES_ROOT: dirname(workspaceRoot),
      // Gancho já existente no processo principal: dispensa o seletor nativo de
      // diretório, que o teste não conseguiria operar.
      TINYIDE_TEST_WORKSPACE_PICKER_PATH: workspaceRoot,
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
 * Percorre o caminho real de abertura de projeto: tela de boas-vindas, diálogo e
 * seleção. Retorna quando o Explorer já lista o conteúdo do workspace.
 */
export async function openProject(window) {
  await window.getByText("Abrir projeto", { exact: true }).first().click();
  await window.getByText("Escolher outro projeto", { exact: true }).click();
  await window.waitForSelector("text=README.md", { timeout: 45_000 });
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
