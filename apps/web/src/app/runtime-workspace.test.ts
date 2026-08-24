import { afterEach, describe, expect, it, vi } from "vitest";
import { getActiveHostWorkspaceRoot, setActiveHostWorkspaceRoot } from "./host-workspace-state";
import { setHostWorkspace } from "./runtime";

describe("host workspace transition", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setActiveHostWorkspaceRoot(undefined);
  });

  it("blocks plugin backend access while the runtime switches workspaces", async () => {
    setActiveHostWorkspaceRoot("/workspace/old");
    let resolveFetch!: (response: Response) => void;
    globalThis.fetch = vi.fn(() => new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    })) as typeof fetch;

    const pending = setHostWorkspace("new", "/workspace/new");
    expect(getActiveHostWorkspaceRoot()).toBeUndefined();

    resolveFetch(new Response(JSON.stringify({ workspaceRoot: "/workspace/new" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    await expect(pending).resolves.toEqual({ workspaceRoot: "/workspace/new" });
    expect(getActiveHostWorkspaceRoot()).toBe("/workspace/new");
  });

  it("keeps plugin access blocked when selecting the new workspace fails", async () => {
    setActiveHostWorkspaceRoot("/workspace/old");
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: "workspace inválido" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;

    await expect(setHostWorkspace("broken", "/workspace/missing")).rejects.toThrow("workspace inválido");
    expect(getActiveHostWorkspaceRoot()).toBeUndefined();
  });
});
