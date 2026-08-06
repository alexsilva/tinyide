import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createWorkspace, executionProfile, launchIde, openFile, openProject } from "./ide-app.mjs";

/**
 * Orçamentos de tempo, não medições exatas: valores generosos o bastante para não
 * acusar máquina lenta, e apertados o bastante para pegar regressão grosseira. Os
 * números observados em desenvolvimento ficam entre parênteses.
 */
const BUDGET = {
  ready: 8_000,        // 1,0s
  openProject: 15_000, // 2,9s
  openFile: 4_000,     // 0,2s
  runProfile: 12_000,  // 0,05s
  keystroke: 150,      // ~30ms por caractere, incluindo o custo do automatizador
};

function locatePython() {
  try {
    return execFileSync("which", ["python3"], { encoding: "utf8" }).trim();
  } catch {
    return undefined;
  }
}

const python = locatePython();

/** Projeto com massa: com três arquivos qualquer coisa parece rápida. */
async function createLargeWorkspace() {
  const files = { "programa.py": 'print("saida do perfil")\n' };
  for (let index = 0; index < 300; index += 1) {
    files[`mod/arquivo_${index}.py`] = `VALOR_${index} = ${index}\n${"# linha de preenchimento\n".repeat(40)}`;
  }
  return createWorkspace(files);
}

test.describe("desempenho", () => {
  test.skip(!python, "python3 não encontrado no ambiente");

  test("abre, carrega o projeto, edita e executa dentro do orçamento", async () => {
    const workspace = await createLargeWorkspace();
    const profile = executionProfile({
      name: "programa",
      executable: python,
      parameters: [workspace.file("programa.py")],
      workingDirectory: workspace.root,
    });
    await workspace.writeSettings({
      executionProfiles: { profiles: [profile], selectedId: profile.id },
    });

    const startedAt = performance.now();
    const ide = await launchIde(workspace.root);
    const { window } = ide;
    try {
      await window.getByText("EXPLORER").waitFor({ timeout: BUDGET.ready });
      const ready = performance.now() - startedAt;

      let mark = performance.now();
      await openProject(window);
      const openedProject = performance.now() - mark;

      mark = performance.now();
      await openFile(window, "programa.py");
      await window.locator("textarea.code-editor").waitFor({ timeout: BUDGET.openFile });
      const openedFile = performance.now() - mark;

      mark = performance.now();
      await window.getByLabel("Executar perfil").first().click();
      await window.getByText(/saida do perfil/).first().waitFor({ timeout: BUDGET.runProfile });
      const executed = performance.now() - mark;

      expect(ready, `abertura da janela levou ${Math.round(ready)}ms`).toBeLessThan(BUDGET.ready);
      expect(openedProject, `carregar o projeto levou ${Math.round(openedProject)}ms`).toBeLessThan(BUDGET.openProject);
      expect(openedFile, `abrir o arquivo levou ${Math.round(openedFile)}ms`).toBeLessThan(BUDGET.openFile);
      expect(executed, `executar o perfil levou ${Math.round(executed)}ms`).toBeLessThan(BUDGET.runProfile);
    } finally {
      await ide.close();
      await workspace.dispose();
    }
  });

  test("o editor continua respondendo enquanto a busca indexa o projeto", async () => {
    const workspace = await createLargeWorkspace();
    const ide = await launchIde(workspace.root);
    const { window } = ide;
    try {
      // Abrir o projeto dispara a indexação; digitar em seguida disputa com ela.
      await openProject(window);
      await openFile(window, "programa.py");
      const editor = window.locator("textarea.code-editor");
      await editor.click();

      const text = "# digitando durante a indexacao";
      const mark = performance.now();
      await editor.type(text);
      const perKeystroke = (performance.now() - mark) / text.length;

      await expect(editor).toHaveValue(/digitando durante a indexacao/);
      expect(
        perKeystroke,
        `${perKeystroke.toFixed(0)}ms por caractere durante a indexação`,
      ).toBeLessThan(BUDGET.keystroke);
    } finally {
      await ide.close();
      await workspace.dispose();
    }
  });
});
