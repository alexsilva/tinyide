import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createWorkspace, launchIde, openFile, openProject } from "./ide-app.mjs";

test.describe("ciclo de vida e uso prolongado", () => {
  /** @type {Awaited<ReturnType<typeof createWorkspace>>} */
  let workspace;
  /** @type {Awaited<ReturnType<typeof launchIde>>} */
  let ide;

  test.beforeAll(async () => {
    workspace = await createWorkspace({
      "README.md": "# Performance lifecycle\n",
    });
    // O diretório de dados do Electron fica fora do workspace: dentro dele, a escrita constante
    // do próprio Chromium vira uma enxurrada de eventos do watcher e o Explorer nunca assenta —
    // uma condição do teste, não do produto.
    ide = await launchIde(workspace.root, {
      env: {
        TINYIDE_AWS_ADAPTER: "fake",
        TINYIDE_AWS_BINARY: join(workspace.root, "aws-cli-disabled-for-e2e"),
        AWS_CONFIG_FILE: join(workspace.root, "aws-config-disabled"),
        AWS_SHARED_CREDENTIALS_FILE: join(workspace.root, "aws-credentials-disabled"),
        AWS_EC2_METADATA_DISABLED: "true",
      },
    });
  });

  test.afterAll(async () => {
    await ide?.close();
    await workspace?.dispose();
  });

  test("monta views e tool windows sob demanda sem acumular superfícies ocultas", async () => {
    const { window } = ide;

    await window.getByLabel("Exibir AWS").click();
    let aws = window.locator('[data-tool-window-id="aws"]');
    await expect(aws).toBeVisible();

    const childCount = (viewId) => aws.locator(`[data-view-id="${viewId}"]`).evaluate(
      (section) => section.childElementCount,
    );
    expect(await childCount("aws.overview")).toBeGreaterThan(0);
    expect(await childCount("aws.ecs")).toBe(0);
    expect(await childCount("aws.secrets")).toBe(0);
    expect(await childCount("aws.console")).toBe(0);

    await window.getByRole("tab", { name: "ECS", exact: true }).click();
    expect(await childCount("aws.ecs")).toBeGreaterThan(0);
    expect(await childCount("aws.overview")).toBe(0);
    expect(await childCount("aws.secrets")).toBe(0);
    expect(await childCount("aws.console")).toBe(0);

    await window.getByRole("tab", { name: "Secrets Manager", exact: true }).click();
    expect(await childCount("aws.secrets")).toBeGreaterThan(0);
    expect(await childCount("aws.ecs")).toBe(0);
    expect(await childCount("aws.console")).toBe(0);

    // Alternância interna também precisa liberar a view anterior; antes todas
    // as views visitadas permaneciam montadas e seus timers/listeners seguiam vivos.
    // A exceção é declarada pelo próprio plugin: o Secrets Manager cuida da própria
    // visibilidade (limpa valores sensíveis e avisa sobre o rascunho descartado).
    for (let index = 0; index < 20; index += 1) {
      const tab = index % 2 === 0 ? "ECS" : "Secrets Manager";
      await window.getByRole("tab", { name: tab, exact: true }).click();
    }
    const mountedAwsViews = await aws.locator(".workbench-tool-window-view").evaluateAll(
      (nodes) => nodes.filter((node) => node.childElementCount > 0).map((node) => node.dataset.viewId),
    );
    expect(mountedAwsViews).toEqual(["aws.secrets"]);
    expect(await childCount("aws.overview")).toBe(0);
    expect(await childCount("aws.console")).toBe(0);

    // AWS não carrega estado vivo que exija retenção: trocar de ferramenta
    // desmonta o host inteiro e libera timers/observers das views já visitadas.
    await window.getByLabel("Exibir Banco de dados").click();
    await expect(window.locator('[data-tool-window-id="database"]')).toBeVisible();
    await expect(window.locator('[data-tool-window-id="aws"]')).toHaveCount(0);

    await window.getByLabel("Exibir AWS").click();
    aws = window.locator('[data-tool-window-id="aws"]');
    await expect(aws).toBeVisible();
    expect(await childCount("aws.overview")).toBeGreaterThan(0);
    expect(await childCount("aws.ecs")).toBe(0);
    expect(await childCount("aws.secrets")).toBe(0);
    expect(await childCount("aws.console")).toBe(0);

    // Terminal é a exceção explícita: PTY/TUI precisa sobreviver oculto.
    await window.getByLabel("Exibir TERMINAL").click();
    const terminal = window.locator('[data-tool-window-id="terminal"]');
    await expect(terminal).toBeVisible();
    await window.getByLabel("Exibir AWS").click();
    await expect(aws).toBeVisible();
    await expect(terminal).toHaveCount(1);
    await expect(terminal).toHaveClass(/tool-window-panel--hidden/);

    // Alternar repetidamente entre superfícies reconstruíveis não pode gerar
    // uma coleção crescente de hosts montados.
    for (let index = 0; index < 12; index += 1) {
      const target = index % 2 === 0 ? "Banco de dados" : "AWS";
      await window.getByLabel(`Exibir ${target}`).click();
    }
    const mountedToolWindowIds = await window.locator("[data-tool-window-id]").evaluateAll(
      (nodes) => nodes.map((node) => node.getAttribute("data-tool-window-id")).filter(Boolean),
    );
    expect(mountedToolWindowIds.filter((id) => id !== "terminal")).toHaveLength(1);
    expect(mountedToolWindowIds).toContain("terminal");
  });

  test("processa rajadas de alterações externas e mantém a IDE responsiva", async () => {
    const { window } = ide;
    await openProject(window);
    await openFile(window, "src/main.py");
    const editor = window.locator("textarea.code-editor");
    await expect(editor).toBeVisible();

    const generatedDir = workspace.file("src/generated");
    await mkdir(generatedDir, { recursive: true });

    for (let burst = 0; burst < 4; burst += 1) {
      await Promise.all(Array.from({ length: 30 }, (_, index) => (
        writeFile(
          join(generatedDir, `burst-${burst}-${index}.txt`),
          `burst=${burst}; index=${index}\n`,
          "utf8",
        )
      )));
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
    }

    const finalSource = [
      "def cumprimentar(nome):",
      "    return f\"olá {nome}\"",
      "",
      "MARCA_EXTERNA_FINAL = 123",
      "",
    ].join("\n");
    await writeFile(workspace.file("src/main.py"), finalSource, "utf8");

    await expect(editor).toHaveValue(/MARCA_EXTERNA_FINAL = 123/, { timeout: 20_000 });

    // Depois da rajada a interface continua respondendo a navegação normal.
    await window.getByText("README.md", { exact: true }).first().dblclick();
    await expect(window.getByText("Performance lifecycle")).toBeVisible({ timeout: 10_000 });
  });
});
