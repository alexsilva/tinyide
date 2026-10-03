import { expect, test } from "@playwright/test";
import { createWorkspace, launchIde, openProject } from "./ide-app.mjs";

/**
 * O plugin mcp-server ativa na inicialização e, até aqui, segurava um long-poll
 * (`GET /ui-actions/next`) por janela — uma das seis conexões HTTP que o
 * Chromium divide entre todas as janelas da IDE — e consultava
 * `/authorizations/pending` uma vez por segundo. Os dois fluxos passam a chegar
 * pelo canal `/events`; os endpoints continuam só para hosts sem canais.
 */
const QUIET_WINDOW_MS = 3_000;

test.describe("canal de eventos do mcp-server", () => {
  /** @type {Awaited<ReturnType<typeof createWorkspace>>} */
  let workspace;
  /** @type {Awaited<ReturnType<typeof launchIde>>} */
  let ide;
  /** @type {string[]} */
  const polls = [];
  /** @type {string[]} */
  const sockets = [];

  test.beforeAll(async () => {
    workspace = await createWorkspace({});
    ide = await launchIde(workspace.root);
    // Os ouvintes entram antes de o projeto abrir: o plugin ativa junto com o
    // workspace, e um long-poll aberto antes deles passaria despercebido.
    ide.window.on("request", (request) => {
      const url = request.url();
      if (url.includes("/ui-actions/next") || url.includes("/authorizations/pending")) polls.push(url);
    });
    ide.window.on("websocket", (socket) => sockets.push(socket.url()));
    await openProject(ide.window);
  });

  test.afterAll(async () => {
    await ide?.close();
    await workspace?.dispose();
  });

  test("abre o canal de eventos e não deixa nenhuma requisição presa", async () => {
    await expect.poll(
      () => sockets.filter((url) => url.includes("/plugin-api/tinyide.mcp-server/events")).length,
      { timeout: 30_000, message: "o plugin deveria abrir /events ao ativar" },
    ).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, QUIET_WINDOW_MS));
    expect(polls).toEqual([]);
  });
});
