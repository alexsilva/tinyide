import { describe, expect, it, vi } from "vitest";
import { mergePluginSettings, readUserSettings, writeUserSettings } from "./user-settings";

describe("user settings", () => {
  it("merges plugin defaults with project overrides per setting key", () => {
    expect(mergePluginSettings(
      {
        "tinyide.terminal": { fontSize: 13, activateEnvironment: true },
        "tinyide.git": { compact: false },
      },
      {
        "tinyide.terminal": { fontSize: 15 },
      },
    )).toEqual({
      "tinyide.terminal": { fontSize: 15, activateEnvironment: true },
      "tinyide.git": { compact: false },
    });
  });

  it("reads user settings from host persistence", async () => {
    const settings = { version: 1 as const, editor: { lineNumbers: false } };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(settings), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(readUserSettings()).resolves.toEqual(settings);
    expect(fetchMock).toHaveBeenCalledWith(
      "/core-api/user/settings",
      expect.objectContaining({ cache: "no-store" }),
    );
    vi.unstubAllGlobals();
  });

  it("writes user settings through host persistence", async () => {
    const settings = { version: 1 as const, appearance: { themeId: "tinyide.dark" } };
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => new Response(init?.body as string, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(writeUserSettings(settings)).resolves.toEqual(settings);
    expect(fetchMock).toHaveBeenCalledWith(
      "/core-api/user/settings",
      expect.objectContaining({ method: "PUT", body: JSON.stringify(settings) }),
    );
    vi.unstubAllGlobals();
  });
});
