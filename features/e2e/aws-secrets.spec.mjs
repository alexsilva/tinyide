import { expect, test } from "@playwright/test";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createWorkspace, launchIde } from "./ide-app.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const testTmpRoot = join(repositoryRoot, ".tmp");

test.describe("AWS Secrets Manager com adapter simulado", () => {
  /** @type {Awaited<ReturnType<typeof createWorkspace>>} */
  let workspace;
  /** @type {Awaited<ReturnType<typeof launchIde>>} */
  let ide;

  test.beforeAll(async () => {
    workspace = await createWorkspace({
      "README.md": "# AWS fake e2e\n",
    }, { baseDir: testTmpRoot });
    ide = await launchIde(workspace.root, {
      userDataDir: join(workspace.root, ".electron-user-data"),
      env: {
        TINYIDE_AWS_ADAPTER: "fake",
        // Defesa adicional: se o adapter errado for selecionado por regressão,
        // nenhum binário AWS real pode ser executado por este teste.
        TINYIDE_AWS_BINARY: join(workspace.root, "aws-cli-disabled-for-e2e"),
        AWS_CONFIG_FILE: join(workspace.root, "aws-config-disabled"),
        AWS_SHARED_CREDENTIALS_FILE: join(workspace.root, "aws-credentials-disabled"),
        AWS_EC2_METADATA_DISABLED: "true",
      },
    });
    await ide.window.waitForLoadState("domcontentloaded");
  });

  test.afterAll(async () => {
    await ide?.close();
    await workspace?.dispose();
  });

  test("lista, consulta e edita secrets sem acessar AWS real", async () => {
    const { window } = ide;
    await window.getByLabel("Exibir AWS").click();
    await expect(window.getByLabel("Abrir AWS em janela separada")).toBeVisible();

    const tabs = window.getByRole("tab");
    await expect(tabs).toHaveText(["Visão geral", "ECS", "Secrets Manager", "CONSOLE"]);

    const overviewRefresh = window.getByLabel("Atualizar estado AWS");
    await expect(overviewRefresh).toBeVisible();
    await expect(overviewRefresh.locator("svg")).toHaveCount(1);
    await overviewRefresh.click();
    await expect(window.getByText("AWS disponível", { exact: true })).toBeVisible();

    await window.getByRole("tab", { name: "ECS", exact: true }).click();
    const ecsDiscover = window.getByLabel("Descobrir clusters ECS");
    await expect(ecsDiscover).toBeVisible();
    await expect(ecsDiscover.locator("svg")).toHaveCount(1);
    await ecsDiscover.click();
    await expect(window.getByRole("treeitem", { name: /Cluster ECS production/ })).toBeVisible();
    const ecsRefresh = window.getByLabel("Atualizar clusters ECS");
    await expect(ecsRefresh).toBeVisible();
    await expect(ecsRefresh.locator("svg")).toHaveCount(1);

    await window.getByRole("tab", { name: "Secrets Manager", exact: true }).click();
    const secretsPanel = window.locator(".tinyide-aws").filter({ hasText: "AWS Secrets Manager" }).first();
    await expect(secretsPanel).toBeVisible();
    await expect(secretsPanel).toContainText("Usa o profile e a região configurados na Visão geral");

    // A configuração global não deve ser duplicada dentro desta aba.
    await expect(secretsPanel.getByLabel("Profile AWS para Secrets Manager")).toHaveCount(0);
    await expect(secretsPanel.getByLabel("Região AWS para Secrets Manager")).toHaveCount(0);

    await secretsPanel.getByLabel("Listar secrets do AWS Secrets Manager").click();
    await expect(secretsPanel.getByText("staging/database", { exact: true })).toBeVisible();
    await expect(secretsPanel.getByText("development/api", { exact: true })).toBeVisible();

    const rawEditor = secretsPanel.getByLabel("Valor do secret", { exact: true });
    await expect(rawEditor).toBeHidden();
    await secretsPanel.getByLabel("Abrir variáveis de staging/database").click();
    await expect(rawEditor).toBeHidden();
    const editorCard = secretsPanel.locator(".tinyide-aws__secret-editor");
    const closeEditor = secretsPanel.getByLabel("Fechar secret selecionado");
    await expect(closeEditor).toBeVisible();
    await expect(secretsPanel.getByLabel("Ocultar valor do secret")).toHaveCount(0);
    const editorBox = await editorCard.boundingBox();
    const closeBox = await closeEditor.boundingBox();
    expect(editorBox).not.toBeNull();
    expect(closeBox).not.toBeNull();
    expect(closeBox.x).toBeGreaterThan(editorBox.x + (editorBox.width / 2));
    const username = secretsPanel.getByLabel("Valor da variável username", { exact: true });
    const password = secretsPanel.getByLabel("Valor da variável password", { exact: true });
    await expect(username).toHaveValue("staging-user");
    await expect(password).toHaveValue("staging-password");
    await expect(password).toHaveClass(/is-masked/);
    await expect(secretsPanel.getByText("2 variáveis", { exact: true })).toBeVisible();
    await expect(secretsPanel.locator('input[aria-label^="Nome da variável"]')).toHaveCount(0);
    const formFields = secretsPanel.getByLabel("Variáveis do secret", { exact: true });

    const revealAll = secretsPanel.getByLabel("Ver todos os valores");
    const jsonView = secretsPanel.getByLabel("Ver JSON do secret");
    await expect(revealAll).toBeVisible();
    await expect(jsonView).toBeVisible();
    const revealAllBox = await revealAll.boundingBox();
    const jsonViewBox = await jsonView.boundingBox();
    expect(Math.abs(revealAllBox.y - jsonViewBox.y)).toBeLessThan(4);
    expect(jsonViewBox.x - (revealAllBox.x + revealAllBox.width)).toBeLessThan(12);
    await revealAll.click();
    await expect(username).not.toHaveClass(/is-masked/);
    await expect(password).not.toHaveClass(/is-masked/);
    await secretsPanel.getByLabel("Ocultar todos os valores").click();
    await expect(username).toHaveClass(/is-masked/);
    await expect(password).toHaveClass(/is-masked/);

    // O menu de uma variável existente precisa flutuar sobre a lista, sem
    // aumentar a área rolável do formulário.
    const scrollHeightBeforeMenu = await formFields.evaluate(element => element.scrollHeight);
    await secretsPanel.getByLabel("Ações da variável password").click();
    const fieldMenu = secretsPanel.getByRole("menu");
    await expect(fieldMenu).toBeVisible();
    await expect(fieldMenu).toHaveCSS("position", "fixed");
    expect(await formFields.evaluate(element => element.scrollHeight)).toBe(scrollHeightBeforeMenu);
    await secretsPanel.getByLabel("Ações da variável password").click();
    await expect(fieldMenu).toHaveCount(0);

    // Uma variável nova é apenas um rascunho local: não deve nascer em estado
    // de erro nem oferecer ações de um recurso que ainda não existe.
    await secretsPanel.getByLabel("Adicionar variável ao secret").click();
    const newKey = secretsPanel.locator('input[placeholder="NOME_DA_VARIAVEL"]').last();
    await expect(newKey).toBeFocused();
    const newRow = newKey.locator("xpath=../..");
    await expect(newRow).not.toContainText("Informe um nome para a variável");
    await expect(newRow.locator('button[aria-label^="Ações da variável "]')).toHaveCount(0);
    await expect(newRow.getByLabel("Descartar nova variável")).toBeVisible();
    await newKey.blur();
    await expect(newRow).toContainText("Informe um nome para a variável");
    const inlineError = newRow.locator(".tinyide-aws__secret-field-key-error");
    await expect(inlineError).toBeVisible();
    const keyBox = await newKey.boundingBox();
    const errorBox = await inlineError.boundingBox();
    expect(errorBox.y).toBeGreaterThan(keyBox.y);
    await newRow.getByLabel("Descartar nova variável").click();
    await expect(secretsPanel.getByText("2 variáveis", { exact: true })).toBeVisible();

    await secretsPanel.getByLabel("Mostrar valor de password").click();
    await expect(password).not.toHaveClass(/is-masked/);
    await secretsPanel.getByLabel("Ocultar valor de password").click();
    await expect(password).toHaveClass(/is-masked/);
    await secretsPanel.getByLabel("Mostrar valor de password").click();
    await password.fill("e2e-updated-password");
    await expect(secretsPanel.getByText(/alterações não salvas/i)).toBeVisible();

    await secretsPanel.getByLabel("Ver JSON do secret").click();
    await expect(rawEditor).toBeVisible();
    await expect(formFields).toBeHidden();
    await expect(rawEditor).toHaveAttribute("readonly", "");
    await expect(rawEditor).toHaveValue(/"password": "e2e-updated-password"/);
    const backToForm = secretsPanel.getByLabel("Ver lista de variáveis");
    const backBox = await backToForm.boundingBox();
    expect(backBox).not.toBeNull();
    expect(backBox.x).toBeGreaterThan(editorBox.x + (editorBox.width / 2));
    await backToForm.click();
    await expect(rawEditor).toBeHidden();
    await expect(formFields).toBeVisible();

    const saveSecret = secretsPanel.getByLabel("Salvar nova versão do secret");
    const saveBox = await saveSecret.boundingBox();
    expect(saveBox).not.toBeNull();
    expect(saveBox.x).toBeGreaterThan(editorBox.x + (editorBox.width / 2));
    await saveSecret.click();
    const confirmation = window.getByRole("alertdialog", { name: "Atualizar secret AWS?" });
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText("Profile default · região us-east-1");
    await confirmation.getByRole("button", { name: "Salvar nova versão", exact: true }).click();
    await expect(secretsPanel).toContainText("Nova versão salva");
    await expect(secretsPanel).toContainText("fake-version-2");

    await secretsPanel.getByLabel("Fechar secret selecionado").click();
    await expect(rawEditor).toBeHidden();
    await expect(rawEditor).toHaveValue("");
    await expect(secretsPanel.getByLabel("Valor da variável password")).toHaveCount(0);

    // Reconsulta para provar que o fake backend persistiu a nova versão.
    await secretsPanel.getByLabel("Abrir variáveis de staging/database").click();
    const passwordAfterSave = secretsPanel.getByLabel("Valor da variável password", { exact: true });
    await expect(passwordAfterSave).toHaveValue("e2e-updated-password");

    // Se houver edição não salva, ocultar a aba limpa o valor sensível e avisa
    // explicitamente que o rascunho foi descartado.
    await passwordAfterSave.fill("draft-not-saved");
    await window.getByRole("tab", { name: "ECS", exact: true }).click();
    await window.getByRole("tab", { name: "Secrets Manager", exact: true }).click();
    await expect(rawEditor).toBeHidden();
    await expect(secretsPanel.getByLabel("Valor da variável password")).toHaveCount(0);
    await expect(secretsPanel).toContainText("Alterações não salvas foram descartadas");
    await secretsPanel.getByLabel("Abrir variáveis de staging/database").click();
    await expect(secretsPanel.getByLabel("Valor da variável password")).toHaveValue("e2e-updated-password");

    // O CONSOLE continua no final e não pode conter o conteúdo escrito.
    await window.getByRole("tab", { name: "CONSOLE", exact: true }).click();
    await expect(rawEditor).toHaveValue("");
    const consolePanel = window.locator(".tinyide-aws").filter({ hasText: "Console AWS" }).first();
    await expect(consolePanel).toBeVisible();
    await expect(consolePanel).toContainText("secretsmanager list-secrets");
    await expect(consolePanel).toContainText("secretsmanager get-secret-value");
    await expect(consolePanel).toContainText("secretsmanager put-secret-value");
    await expect(consolePanel).not.toContainText("e2e-updated-password");
    await expect(consolePanel).toContainText("***");

    // A lista pertence ao contexto em que foi descoberta. Trocar profile invalida
    // os ARNs antigos antes de qualquer nova consulta/escrita.
    await window.getByRole("tab", { name: "Visão geral", exact: true }).click();
    await window.getByLabel("Profile AWS").selectOption("staging");
    await window.getByRole("tab", { name: "Secrets Manager", exact: true }).click();
    await expect(secretsPanel).toContainText("O profile ou a região mudou. Liste os secrets novamente.");
    await expect(secretsPanel.getByLabel("Abrir variáveis de staging/database")).toHaveCount(0);
  });

  test("mantém a ação de abrir o painel AWS em janela separada", async () => {
    const { application, window } = ide;
    const showAws = window.getByLabel("Exibir AWS");
    const hideAws = window.getByLabel("Ocultar AWS");
    await expect.poll(async () => (await showAws.count()) + (await hideAws.count())).toBe(1);
    if (await showAws.count()) await showAws.click();
    const secretsTab = window.getByRole("tab", { name: "Secrets Manager", exact: true });
    await expect(secretsTab).toBeVisible();
    await secretsTab.click();
    const detach = window.getByLabel("Abrir AWS em janela separada");
    await expect(detach).toBeVisible();

    const detachedPromise = application.waitForEvent("window");
    await detach.click();
    const detached = await detachedPromise;
    await detached.waitForLoadState("domcontentloaded");

    expect(detached.url()).toContain("tinyidePanelView=aws.secrets");
    await expect(detached.locator('[data-tool-window-id="aws"]')).toBeVisible();
    await expect(detached.getByRole("tab", { name: "Visão geral", exact: true })).toBeVisible();
    await expect(detached.getByRole("tab", { name: "CONSOLE", exact: true })).toBeVisible();
    await expect(detached.getByRole("tab", { name: "Secrets Manager", exact: true })).toHaveAttribute("aria-selected", "true");
    await detached.close();
  });
});
