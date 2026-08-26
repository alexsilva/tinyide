import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  readHostState,
  readUserSettings,
  readUserState,
  writeHostState,
  writeUserSettings,
  writeUserState,
} from "./user-data-backend.mjs";

const roots = [];

async function testRoot() {
  const base = resolve(".tmp");
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, "tinyide-user-data-"));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("user data backend", () => {
  it("returns a versioned empty user profile when no file exists", async () => {
    expect(await readUserSettings(await testRoot())).toEqual({ version: 1 });
  });

  it("persists user settings in a durable JSON file", async () => {
    const root = await testRoot();
    const settings = await writeUserSettings(root, {
      version: 1,
      editor: { lineNumbers: false },
      appearance: { themeId: "tinyide.dark" },
    });

    expect(settings).toEqual({
      version: 1,
      editor: { lineNumbers: false },
      appearance: { themeId: "tinyide.dark" },
    });
    expect(await readUserSettings(root)).toEqual(settings);
    expect(JSON.parse(await readFile(join(root, "settings.json"), "utf8"))).toEqual(settings);
  });

  it("guarda o estado de UI dentro do diretório do próprio workspace", async () => {
    const root = await testRoot();
    const session = { sidebarVisible: false, sidebarViewsBySide: {} };
    const alpha = "alpha-0011223344556677";
    const beta = "beta-7766554433221100";
    await writeUserState(root, "ui-session", session, alpha);
    await writeUserState(root, "ui-session", { sidebarVisible: true }, beta);

    expect(await readUserState(root, "ui-session", alpha)).toEqual(session);
    expect(await readUserState(root, "ui-session", beta)).toEqual({ sidebarVisible: true });
    expect(await readdir(join(root, "workspaces", alpha, "state"))).toEqual(["ui-session.json"]);
    // Nada de estado de projeto vaza para o diretório global.
    await expect(readdir(join(root, "state"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  /**
   * A allowlist é a defesa estrutural do isolamento: uma chave nova sem escopo
   * falha em vez de cair no diretório compartilhado, que foi como o estado de
   * um projeto passou a sobrescrever o de outro.
   */
  it("só aceita fora de escopo as chaves que pertencem ao usuário", async () => {
    const root = await testRoot();
    await writeUserState(root, "recent-projects", [{ id: "a" }]);

    expect(await readUserState(root, "recent-projects")).toEqual([{ id: "a" }]);
    expect(await readdir(join(root, "state"))).toEqual(["recent-projects.json"]);
    await expect(writeUserState(root, "ui-session", {})).rejects.toThrow("exige escopo");
  });

  it("separa o ponteiro de cada host", async () => {
    const root = await testRoot();
    await writeHostState(root, "web", "last-workspace", { path: "/projetos/alpha" });
    await writeHostState(root, "desktop", "last-workspace", { path: "/projetos/beta" });

    expect(await readHostState(root, "web", "last-workspace")).toEqual({ path: "/projetos/alpha" });
    expect(await readHostState(root, "desktop", "last-workspace")).toEqual({ path: "/projetos/beta" });
  });

  it("rejects unsafe state keys", async () => {
    const root = await testRoot();
    await expect(writeUserState(root, "../outside", {}, "alpha-0011223344556677"))
      .rejects.toThrow("Chave de estado do usuário inválida");
    await expect(writeUserState(root, "ui-session", {}, "../escape"))
      .rejects.toThrow("Identificador de workspace inválido");
  });
});
