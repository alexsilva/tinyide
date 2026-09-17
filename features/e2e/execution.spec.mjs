import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import {
  createWorkspace,
  executionProfile,
  launchIde,
  openFile,
  openProject,
  pythonEnvironment,
} from "./ide-app.mjs";

/** O cenário exige um interpretador real; sem ele não há o que verificar. */
function locatePython() {
  try {
    return execFileSync("which", ["python3"], { encoding: "utf8" }).trim();
  } catch {
    return undefined;
  }
}

const python = locatePython();
const PROGRAM = `def acumular(valores):
    total = 0
    for valor in valores:
        total += valor
    return total


def principal():
    valores = [1, 2, 3]
    total = acumular(valores)
    print("total calculado:", total)
    return total


principal()
`;

const ENVIRONMENT_PROGRAM = `import os

print("variavel de ambiente:", os.environ.get("TINYIDE_E2E_VAR", "(ausente)"))
`;

// A saída vem de uma concatenação: "saudacao: original" nunca existe literal no
// código-fonte, então encontrá-la na tela prova que veio do processo, não do editor.
const SAVE_PROGRAM = `print("saudacao:", "ori" + "ginal")
`;

test.describe("execução e depuração", () => {
  test.skip(!python, "python3 não encontrado no ambiente");

  /** @type {Awaited<ReturnType<typeof createWorkspace>>} */
  let workspace;
  /** @type {Awaited<ReturnType<typeof launchIde>>} */
  let ide;

  test.beforeAll(async () => {
    workspace = await createWorkspace({
      "programa.py": PROGRAM,
      "ambiente.py": ENVIRONMENT_PROGRAM,
      "saudacao.py": SAVE_PROGRAM,
    });
    const environment = pythonEnvironment(python);
    const profile = {
      ...executionProfile({
        name: "programa",
        executable: python,
        parameters: [workspace.file("programa.py")],
        workingDirectory: workspace.root,
      }),
      // Depurar exige um ambiente do provedor Python: com `mode: "none"` o
      // adaptador não se aplica e o botão fica indisponível.
      environment: { mode: "fixed", environmentId: environment.id },
    };
    const environmentProfile = executionProfile({
      name: "ambiente",
      executable: python,
      parameters: [workspace.file("ambiente.py")],
      workingDirectory: workspace.root,
    });
    // Sem a flag saveBeforeRun, como um perfil gravado antes de ela existir: o diálogo
    // a exibe ligada, então a execução precisa tratá-la como ligada também.
    const { saveBeforeRun: _defaultOn, ...saveProfile } = executionProfile({
      name: "saudacao",
      executable: python,
      parameters: [workspace.file("saudacao.py")],
      workingDirectory: workspace.root,
    });
    await workspace.writePythonEnvironments([environment]);
    await workspace.writeSettings({
      environment: { selectedId: environment.id },
      executionProfiles: { profiles: [profile, environmentProfile, saveProfile], selectedId: profile.id },
    });
    ide = await launchIde(workspace.root);
    await openProject(ide.window);
  });

  test.afterAll(async () => {
    await ide?.close();
    await workspace?.dispose();
  });

  test("carrega o perfil gravado no workspace com execução e depuração ativas", async () => {
    const { window } = ide;
    const selector = window.getByLabel("Perfil de execução").first();
    await expect(selector).toContainText("programa", { timeout: 30_000 });
    await expect(window.getByLabel("Executar perfil").first()).toBeEnabled();
    await expect(window.getByLabel("Depurar perfil").first()).toBeEnabled();
  });

  test("executa o programa e mostra a saída no painel", async () => {
    const { window } = ide;
    await window.getByLabel("Executar perfil").first().click();
    await expect(window.getByText(/total calculado: 6/)).toBeVisible({ timeout: 45_000 });
  });

  test("depura o programa até o fim, com saída do processo e do depurador", async () => {
    const { window } = ide;
    await window.getByLabel("Depurar perfil").first().click();

    // A sessão de depuração abre seu próprio painel.
    await expect(window.getByText(/programa \(Debug\)/)).toBeVisible({ timeout: 45_000 });
    // Saída do PDB: a execução para na primeira linha antes de seguir.
    await expect(window.getByText(/->\s*def acumular/)).toBeVisible({ timeout: 45_000 });
    // O programa roda até o fim e imprime seu resultado no painel em foco. A execução
    // anterior deixou o mesmo texto em um painel oculto, então só vale o que está
    // efetivamente visível.
    await expect.poll(
      () => window.evaluate(() => [...document.querySelectorAll("*")].some((element) => (
        element.children.length === 0
        && /total calculado: 6/.test(element.textContent ?? "")
        && element.getClientRects().length > 0
      ))),
      { timeout: 45_000, message: "a saída do programa deveria aparecer no painel de depuração" },
    ).toBe(true);
    // A sessão encerra sozinha em vez de o PDB reiniciar o script.
    await expect(window.getByText(/will be restarted/)).toHaveCount(0);
  });

  test("oferece reinício da depuração na barra da sessão", async () => {
    const { window } = ide;
    await window.getByLabel("Depurar perfil").first().click();
    await expect(window.getByText(/programa \(Debug\)/)).toBeVisible({ timeout: 45_000 });
    // Controle da sessão em curso: reiniciar precisa estar ao alcance sem sair do painel.
    await expect(window.getByLabel("Reiniciar depuração").first()).toBeVisible({ timeout: 45_000 });
  });

  test("salva o arquivo alterado no editor antes de executar, sem Ctrl+S", async () => {
    const { window } = ide;
    await openFile(window, "saudacao.py");
    const editor = window.locator("textarea.code-editor");
    await expect(editor).toHaveValue(/saudacao/);
    await editor.click();
    await window.keyboard.press("ControlOrMeta+a");
    await editor.pressSequentially('print("saudacao:", "edi" + "tado")');

    await window.getByLabel("Perfil de execução").first().click();
    await window.getByRole("menuitem", { name: "saudacao" }).click();
    await window.getByLabel("Executar perfil").first().click();

    // A saída reflete a edição não salva: executar gravou o arquivo por conta própria.
    await expect(window.getByText(/saudacao: editado/)).toBeVisible({ timeout: 45_000 });
    expect(await readFile(workspace.file("saudacao.py"), "utf8")).toContain('"edi" + "tado"');
  });

  // Fica por último: salvar o diálogo troca o perfil selecionado para "ambiente".
  test("variável de ambiente digitada no diálogo vale no processo executado", async () => {
    const { window } = ide;
    await window.getByLabel("Gerenciar perfis").first().click();
    await window.locator(".profile-card__select", { hasText: "ambiente" }).click();

    // Digitar tecla a tecla: linhas parciais ("T", "TI", ...) não podem engolir o texto.
    const variables = window.getByLabel("Variáveis de ambiente");
    await variables.click();
    await variables.pressSequentially("TINYIDE_E2E_VAR=valor-vivo");
    await expect(variables).toHaveValue("TINYIDE_E2E_VAR=valor-vivo");

    await window.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(window.getByLabel("Perfil de execução").first()).toContainText("ambiente", { timeout: 30_000 });
    await window.getByLabel("Executar perfil").first().click();
    // O programa imprime o valor lido do próprio processo: a variável saiu do
    // diálogo e chegou ao ambiente da execução.
    await expect(window.getByText(/variavel de ambiente: valor-vivo/)).toBeVisible({ timeout: 45_000 });
  });
});
