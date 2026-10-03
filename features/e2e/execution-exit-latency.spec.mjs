import { expect, test } from "@playwright/test";
import { createWorkspace, executionProfile, launchIde, openProject } from "./ide-app.mjs";

/**
 * Fim de uma execução de perfil: o painel deve mostrar o `[exit]` assim que o
 * processo termina, sem esperar o próximo poll. A saída de processos do core
 * viaja por um canal WebSocket (`/core-api/execution/processes/<id>/stream`).
 * Sem ele, o painel consultava `/output?cursor=` a cada 200 ms a 1 s, o fim da
 * execução chegava com até um segundo de atraso e, com saída acumulada, uma
 * requisição a cada 25 ms disputava o pool de seis conexões do Chromium com o
 * resto da IDE.
 *
 * A latência é medida entre o `finishedAt` registrado pelo runtime (relógio da
 * mesma máquina) e o instante em que a linha `[exit]` apareceu na tela; a
 * asserção determinística é a ausência de polls.
 */
const EXIT_LATENCY_BUDGET_MS = 500;

test.describe("fim da execução de perfil", () => {
  /** @type {Awaited<ReturnType<typeof createWorkspace>>} */
  let workspace;
  /** @type {Awaited<ReturnType<typeof launchIde>>} */
  let ide;

  test.beforeAll(async () => {
    workspace = await createWorkspace({ "fim.sh": "#!/bin/sh\necho marco-de-saida\n" });
    const profile = executionProfile({
      name: "fim",
      executable: "sh",
      parameters: [workspace.file("fim.sh")],
      workingDirectory: workspace.root,
    });
    await workspace.writeSettings({
      executionProfiles: { profiles: [profile], selectedId: profile.id },
    });
    ide = await launchIde(workspace.root);
    await openProject(ide.window);
  });

  test.afterAll(async () => {
    await ide?.close();
    await workspace?.dispose();
  });

  test("mostra o fim do processo pelo canal, sem poll de saída", async () => {
    const { window } = ide;
    const outputPolls = [];
    const sockets = [];
    window.on("request", (request) => {
      if (request.url().includes("/output?cursor=")) outputPolls.push(request.url());
    });
    window.on("websocket", (socket) => sockets.push(socket.url()));

    const run = window.getByLabel("Executar perfil").first();
    await expect(run).toBeEnabled({ timeout: 30_000 });
    await run.click();

    const exitLine = window.getByText(/\[exit\] 0/);
    await expect.poll(() => exitLine.count(), { intervals: [10], timeout: 45_000 }).toBeGreaterThan(0);
    const observedAt = Date.now();
    await expect(window.getByText(/marco-de-saida/)).toBeVisible();

    const processes = await window.evaluate(async () => {
      const scope = location.pathname.match(/^\/w\/[^/]+/)?.[0] ?? "";
      const response = await fetch(`${scope}/core-api/execution/processes`, { cache: "no-store" });
      return response.json();
    });
    const process = processes.find((item) => item.presentation?.sourceName === "fim");
    expect(process?.status).toBe("exited");
    const latencyMs = observedAt - process.finishedAt;
    test.info().annotations.push({ type: "latência do [exit]", description: `${latencyMs} ms` });
    console.log(`[e2e] latência do [exit]: ${latencyMs} ms; sockets: ${sockets.length}; polls: ${outputPolls.length}`);

    expect(sockets.some((url) => /\/core-api\/execution\/processes\/[^/]+\/stream$/.test(url))).toBe(true);
    expect(outputPolls).toEqual([]);
    expect(latencyMs).toBeLessThan(EXIT_LATENCY_BUDGET_MS);
  });

  /**
   * Referência na mesma sessão: sem WebSocket na página, o painel volta ao poll
   * por requisições e o fim da execução chega atrasado. Não é um orçamento —
   * é a prova de que o fallback continua funcionando num host antigo e a
   * medida do que o canal elimina.
   */
  test("sem canal, o fim chega pelo poll de saída (fallback de referência)", async () => {
    const { window } = ide;
    const outputPolls = [];
    window.on("request", (request) => {
      if (request.url().includes("/output?cursor=")) outputPolls.push(request.url());
    });
    await window.evaluate(() => {
      // @ts-expect-error forçar o caminho sem canais, como num ambiente antigo
      window.WebSocket = undefined;
    });

    const before = await window.evaluate(async () => {
      const scope = location.pathname.match(/^\/w\/[^/]+/)?.[0] ?? "";
      const response = await fetch(`${scope}/core-api/execution/processes`, { cache: "no-store" });
      return (await response.json()).length;
    });
    await window.getByLabel("Executar perfil").first().click();
    await expect.poll(async () => {
      const scope = await window.evaluate(async () => {
        const prefix = location.pathname.match(/^\/w\/[^/]+/)?.[0] ?? "";
        const response = await fetch(`${prefix}/core-api/execution/processes`, { cache: "no-store" });
        return (await response.json()).length;
      });
      return scope;
    }, { intervals: [20], timeout: 30_000 }).toBeGreaterThan(before);

    const exitLines = window.getByText(/\[exit\] 0/);
    await expect.poll(() => exitLines.count(), { intervals: [10], timeout: 45_000 }).toBeGreaterThan(0);
    const observedAt = Date.now();
    const processes = await window.evaluate(async () => {
      const scope = location.pathname.match(/^\/w\/[^/]+/)?.[0] ?? "";
      const response = await fetch(`${scope}/core-api/execution/processes`, { cache: "no-store" });
      return response.json();
    });
    const latest = processes.find((item) => item.presentation?.sourceName === "fim");
    expect(latest?.status).toBe("exited");
    const latencyMs = observedAt - latest.finishedAt;
    test.info().annotations.push({ type: "latência do [exit] sem canal", description: `${latencyMs} ms` });
    console.log(`[e2e] latência do [exit] sem canal: ${latencyMs} ms; polls: ${outputPolls.length}`);
    expect(outputPolls.length).toBeGreaterThan(0);
  });
});
