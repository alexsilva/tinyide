import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  readUserSettings,
  readUserState,
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

  it("stores session state outside project settings and leaves no temporary files", async () => {
    const root = await testRoot();
    const session = { sidebarVisible: false, sidebarViewsBySide: {} };
    await writeUserState(root, "ui-session.project-a", session);

    expect(await readUserState(root, "ui-session.project-a")).toEqual(session);
    expect(await readdir(join(root, "state"))).toEqual(["ui-session.project-a.json"]);
  });

  it("rejects unsafe state keys", async () => {
    const root = await testRoot();
    await expect(writeUserState(root, "../outside", {})).rejects.toThrow("Chave de estado do usuário inválida");
  });
});
