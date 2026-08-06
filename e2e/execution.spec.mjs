import { expect, test } from "@playwright/test";
import { execFileSync } from "node:child_process";
import {
  createWorkspace,
  executionProfile,
  launchIde,
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

test.describe("execução e depuração", () => {
  test.skip(!python, "python3 não encontrado no ambiente");

  /** @type {Awaited<ReturnType<typeof createWorkspace>>} */
  let workspace;
  /** @type {Awaited<ReturnType<typeof launchIde>>} */
  let ide;

  test.beforeAll(async () => {
    workspace = await createWorkspace({ "programa.py": PROGRAM });
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
    await workspace.writePythonEnvironments([environment]);
    await workspace.writeSettings({
      environment: { selectedId: environment.id },
      executionProfiles: { profiles: [profile], selectedId: profile.id },
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
});
