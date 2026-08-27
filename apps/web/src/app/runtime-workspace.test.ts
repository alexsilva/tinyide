// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { getActiveHostWorkspaceRoot, setActiveHostWorkspaceRoot } from "./host-workspace-state";
import { activeWorkspaceScopeId, clearActiveWorkspaceScope } from "./project-session";
import { setHostWorkspace } from "./runtime";

describe("host workspace transition", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setActiveHostWorkspaceRoot(undefined);
    clearActiveWorkspaceScope();
    window.history.replaceState(null, "", "/");
  });

  it("blocks plugin backend access while the runtime switches workspaces", async () => {
    setActiveHostWorkspaceRoot("/workspace/old");
    let resolveFetch!: (response: Response) => void;
    globalThis.fetch = vi.fn(() => new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    })) as typeof fetch;

    const pending = setHostWorkspace("new", "/workspace/new");
    expect(getActiveHostWorkspaceRoot()).toBeUndefined();

    resolveFetch(new Response(
      JSON.stringify({ workspaceRoot: "/workspace/new", scopeId: "new-0011223344556677" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    await expect(pending).resolves.toEqual({
      workspaceRoot: "/workspace/new",
      scopeId: "new-0011223344556677",
    });
    expect(getActiveHostWorkspaceRoot()).toBe("/workspace/new");
    // Abrir o projeto reancora a janela: um reload volta para o mesmo escopo.
    expect(activeWorkspaceScopeId()).toBe("new-0011223344556677");
    expect(window.location.pathname).toBe("/w/new-0011223344556677/");
  });

  it("restores plugin access to the current workspace when selecting the new workspace fails", async () => {
    setActiveHostWorkspaceRoot("/workspace/old");
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ error: "workspace inválido" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;

    await expect(setHostWorkspace("broken", "/workspace/missing")).rejects.toThrow("workspace inválido");
    expect(getActiveHostWorkspaceRoot()).toBe("/workspace/old");
  });
});
