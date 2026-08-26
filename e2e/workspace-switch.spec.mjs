import { expect, test } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { createWorkspace, launchIde } from "./ide-app.mjs";

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

  async function openProjectFromPicker(window) {
    await window.getByText("Abrir projeto", { exact: true }).first().click();
    await window.getByText("Escolher outro projeto", { exact: true }).click();
  }

  test("abrir um projeto recente na tela atual troca o workspace", async () => {
    // Primeira execução: abre A pelo seletor, o que o registra nos recentes.
    const first = await launchIde(projectA.root, { userDataDir, pickerPath: projectA.root });
    await openProjectFromPicker(first.window);
    await expect(first.window.getByText("somente-em-a.txt", { exact: true })).toBeVisible({ timeout: 45_000 });
    await first.close();

    // Segunda execução, mesmo estado: abre B e depois volta para A pelo menu de
    // recentes, na tela atual — o cenário relatado.
    const second = await launchIde(projectB.root, { userDataDir, pickerPath: projectB.root });
    try {
      await openProjectFromPicker(second.window);
      await expect(second.window.getByText("somente-em-b.txt", { exact: true })).toBeVisible({ timeout: 45_000 });

      await second.window.getByRole("button", { name: /^Projeto/ }).click();
      await second.window.getByRole("menuitem", { name: new RegExp(basename(projectA.root)) }).click();

      await expect(second.window.getByText("somente-em-a.txt", { exact: true })).toBeVisible({ timeout: 45_000 });
      await expect(second.window.getByText(/não está disponível dentro da raiz/)).toHaveCount(0);
      await expect(second.window.getByText("somente-em-b.txt", { exact: true })).toHaveCount(0);
    } finally {
      await second.close();
    }
  });
});
