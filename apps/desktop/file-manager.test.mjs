import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { openInSystemFileManager } = require("./file-manager.cjs");

describe("desktop file manager", () => {
  it("opens directories directly", async () => {
    const shell = {
      openPath: vi.fn(async () => ""),
      showItemInFolder: vi.fn(),
    };

    await expect(openInSystemFileManager(shell, "/workspace/src", {
      isDirectory: () => true,
    })).resolves.toEqual({ directory: "/workspace/src", selected: false });

    expect(shell.openPath).toHaveBeenCalledWith("/workspace/src");
    expect(shell.showItemInFolder).not.toHaveBeenCalled();
  });

  it("reveals files in their parent directory", async () => {
    const shell = {
      openPath: vi.fn(),
      showItemInFolder: vi.fn(),
    };

    await expect(openInSystemFileManager(shell, "/workspace/src/main.ts", {
      isDirectory: () => false,
    })).resolves.toEqual({ directory: "/workspace/src", selected: true });

    expect(shell.showItemInFolder).toHaveBeenCalledWith("/workspace/src/main.ts");
    expect(shell.openPath).not.toHaveBeenCalled();
  });

  it("reports directory open failures to the renderer", async () => {
    const shell = {
      openPath: vi.fn(async () => "not available"),
      showItemInFolder: vi.fn(),
    };

    await expect(openInSystemFileManager(shell, "/workspace/src", {
      isDirectory: () => true,
    })).rejects.toThrow("not available");
  });
});
