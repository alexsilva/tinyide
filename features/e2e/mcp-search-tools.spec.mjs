import { expect, test } from "@playwright/test";
import { createServer } from "node:net";
import { createWorkspace, launchIde, openProject } from "./ide-app.mjs";

/**
 * A busca indexada chega a um agente pelo caminho inteiro que ele usaria: o
 * plugin search publica as ferramentas em `handle.mcpTools`, o host as entrega
 * ao plugin mcp-server, o cliente MCP se registra, pede autorização — que o
 * usuário concede no diálogo da IDE — e chama `fast_search`, `fast_search_files`
 * e `fast_search_status` pelo protocolo, com os resultados do índice de verdade.
 */
const SEARCH_TOOLS = ["fast_search", "fast_search_files", "fast_search_status"];

/** Uma porta livre: a padrão pode estar com a IDE do usuário desta máquina. */
async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return port;
}

function updateCookieJar(response, jar) {
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";")[0];
    const separator = pair.indexOf("=");
    const name = pair.slice(0, separator);
    const value = pair.slice(separator + 1);
    if (value) jar.set(name, value);
    else jar.delete(name);
  }
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function expectRedirect(response, step) {
  expect(response.status, `${step}: esperava redirecionamento`).toBe(303);
  const location = response.headers.get("location");
  expect(location, `${step}: redirecionamento sem Location`).toBeTruthy();
  return location;
}

/**
 * Fluxo OAuth de um cliente público (PKCE), como o mcp-remote faz; a decisão
 * do usuário é tomada pelo diálogo "Autorizar cliente MCP?" na janela da IDE.
 */
async function authorizeClient({ origin, window }) {
  const registration = await fetch(`${origin}/reg`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Agente de busca (e2e)",
      redirect_uris: ["http://127.0.0.1:1/callback"],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
  });
  expect(registration.status).toBe(201);
  const client = await registration.json();

  const verifier = "e".repeat(64);
  const challenge = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))).toString("base64url");
  const authUrl = new URL(`${origin}/auth`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", client.client_id);
  authUrl.searchParams.set("redirect_uri", client.redirect_uris[0]);
  authUrl.searchParams.set("scope", "tinyide:tools");
  authUrl.searchParams.set("resource", `${origin}/mcp`);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  const jar = new Map();
  const follow = async (url, init = {}) => {
    const response = await fetch(new URL(url, origin), {
      ...init,
      headers: { ...(init.headers ?? {}), Cookie: cookieHeader(jar) },
      redirect: "manual",
    });
    updateCookieJar(response, jar);
    return response;
  };

  let location = await expectRedirect(await follow(authUrl), "auth");
  location = await expectRedirect(await follow(location), "login automático");
  location = await expectRedirect(await follow(location), "retomada");
  expect(location.startsWith("/interaction/")).toBe(true);
  const consentPage = await follow(location);
  expect(consentPage.status).toBe(200);

  // O pedido pendente chega à IDE pelo canal /events e vira o diálogo de
  // autorização; é aqui que o usuário decide.
  const dialog = window.getByRole("alertdialog", { name: "Autorizar cliente MCP?" });
  await expect(dialog).toBeVisible({ timeout: 15_000 });
  await expect(dialog).toContainText("Agente de busca (e2e)");
  await dialog.getByRole("button", { name: "Autorizar", exact: true }).click();

  let redirect = await expectRedirect(await follow(location, { method: "POST" }), "consentimento");
  let callback;
  for (let attempt = 0; attempt < 5 && redirect; attempt += 1) {
    const target = new URL(redirect, origin);
    if (target.origin !== origin) {
      callback = target;
      break;
    }
    const response = await follow(target);
    expect([302, 303]).toContain(response.status);
    redirect = response.headers.get("location");
  }
  expect(callback, "o fluxo deveria terminar no callback do cliente").toBeTruthy();
  const code = callback.searchParams.get("code");
  expect(code).toBeTruthy();

  const token = await fetch(`${origin}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: client.redirect_uris[0],
      client_id: client.client_id,
      code_verifier: verifier,
      resource: `${origin}/mcp`,
    }),
  });
  expect(token.status).toBe(200);
  return (await token.json()).access_token;
}

async function mcpRequest({ origin, accessToken, method, params }) {
  const response = await fetch(`${origin}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  expect(response.status, `${method} deveria responder 200`).toBe(200);
  const body = await response.text();
  if (!response.headers.get("content-type")?.includes("text/event-stream")) return JSON.parse(body);
  const data = body.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).filter(Boolean);
  expect(data.length, `resposta SSE sem evento data: ${body}`).toBeGreaterThan(0);
  return JSON.parse(data.at(-1));
}

async function callTool(context, name, args = {}) {
  const message = await mcpRequest({ ...context, method: "tools/call", params: { name, arguments: args } });
  expect(message.error, `${name} respondeu erro JSON-RPC`).toBeUndefined();
  expect(message.result.isError, `${name} falhou: ${message.result.content?.[0]?.text}`).not.toBe(true);
  return message.result;
}

test.describe("busca indexada como ferramenta MCP", () => {
  /** @type {Awaited<ReturnType<typeof createWorkspace>>} */
  let workspace;
  /** @type {Awaited<ReturnType<typeof launchIde>>} */
  let ide;

  test.beforeAll(async () => {
    workspace = await createWorkspace({
      "docs/guia.md": "# Guia\n\nProcure por ALVO_DE_BUSCA no código.\n",
      "node_modules/pacote/index.js": "const ALVO_DE_BUSCA = 'não deve entrar no índice';\n",
    });
    // O servidor não sobe sozinho por padrão; a preferência gravada no
    // workspace é o que um usuário que usa agentes deixa marcado.
    await workspace.writeSettings({
      pluginData: {
        "tinyide.mcp-server": {
          server: { host: "127.0.0.1", port: await freePort(), autoStart: true },
          disabledTools: [],
        },
      },
    });
    ide = await launchIde(workspace.root);
    await openProject(ide.window);
  });

  test.afterAll(async () => {
    await ide?.close();
    await workspace?.dispose();
  });

  test("um agente autorizado busca conteúdo e arquivos pelo índice", async () => {
    // O mcp-server recolhe as ferramentas contribuídas pelo runtime; a busca
    // precisa aparecer, habilitada, no catálogo do servidor em execução.
    const serverStatus = () => ide.window.evaluate(
      () => fetch("plugin-api/tinyide.mcp-server/status").then((response) => response.json()),
    );
    await expect.poll(async () => {
      const current = await serverStatus();
      if (!current?.running) return "servidor parado";
      const missing = SEARCH_TOOLS.filter((name) => !current.tools?.some((tool) => tool.name === name && tool.enabled));
      return missing.length ? `faltam: ${missing.join(", ")}` : "pronto";
    }, { timeout: 45_000, message: "o MCP Server deveria estar rodando com as ferramentas de busca" }).toBe("pronto");
    const origin = new URL((await serverStatus()).endpoint).origin;

    // O índice inicial termina antes das asserções sobre resultados completos.
    await expect.poll(
      () => ide.window.evaluate(() => fetch("plugin-api/tinyide.search/status").then((response) => response.json()).then((payload) => payload.indexing)),
      { timeout: 45_000, message: "a indexação inicial deveria terminar" },
    ).toBe(false);

    const accessToken = await authorizeClient({ origin, window: ide.window });
    const context = { origin, accessToken };

    const listed = await mcpRequest({ ...context, method: "tools/list", params: {} });
    const names = listed.result.tools.map((tool) => tool.name);
    for (const name of SEARCH_TOOLS) expect(names).toContain(name);
    const contentTool = listed.result.tools.find((tool) => tool.name === "fast_search");
    expect(contentTool.annotations.readOnlyHint).toBe(true);
    expect(contentTool.inputSchema.required).toEqual(["query"]);

    const content = await callTool(context, "fast_search", { query: "ALVO_DE_BUSCA" });
    const paths = content.structuredContent.results.map((entry) => entry.path).sort();
    expect(paths).toEqual(["docs/guia.md", "src/util.py"]);
    const util = content.structuredContent.results.find((entry) => entry.path === "src/util.py");
    expect(util.matches).toEqual([{ line: 1, column: 1, matchLength: "ALVO_DE_BUSCA".length, text: "ALVO_DE_BUSCA = 42", textColumn: 1 }]);
    expect(content.structuredContent.totalFiles).toBe(2);
    expect(content.structuredContent.indexing).toBe(false);
    expect(JSON.parse(content.content[0].text)).toEqual(content.structuredContent);

    const regex = await callTool(context, "fast_search", { query: "def \\w+\\(nome\\)", regex: true });
    expect(regex.structuredContent.results.map((entry) => entry.path)).toEqual(["src/main.py"]);

    const files = await callTool(context, "fast_search_files", { query: "util" });
    expect(files.structuredContent.results[0].path).toBe("src/util.py");
    const exact = await callTool(context, "fast_search_files", { query: "sutil", exact: true });
    expect(exact.structuredContent.results).toEqual([]);

    const indexStatus = await callTool(context, "fast_search_status");
    expect(indexStatus.structuredContent.phase).toBe("idle");
    expect(indexStatus.structuredContent.indexing).toBe(false);
    expect(indexStatus.structuredContent.documentCount).toBe(4);

    // Erro de uso volta como resultado de ferramenta, não como falha do servidor.
    const invalid = await mcpRequest({ ...context, method: "tools/call", params: { name: "fast_search", arguments: { query: "([", regex: true } } });
    expect(invalid.result.isError).toBe(true);
    expect(invalid.result.content[0].text).toMatch(/inválida/);
  });
});
