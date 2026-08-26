// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activeWorkspaceScopeId,
  clearActiveWorkspaceScope,
  hasActiveWorkspaceScope,
  projectRuntimeFetch,
  projectSessionInternals,
  projectWindowUrl,
  runtimeFetch,
  setActiveWorkspaceScope,
  workspaceScopedPath,
} from "./project-session";

afterEach(() => {
  clearActiveWorkspaceScope();
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

describe("workspace scope identity", () => {
  it("accepts only bounded path-safe identifiers", () => {
    expect(projectSessionInternals.validScopeId("tinyide-9f2c4a01bb3d7e55")).toBe(true);
    expect(projectSessionInternals.validScopeId("../project")).toBe(false);
    expect(projectSessionInternals.validScopeId("with space")).toBe(false);
    expect(projectSessionInternals.validScopeId("Upper-Case")).toBe(false);
    expect(projectSessionInternals.validScopeId("x".repeat(97))).toBe(false);
  });

  it("reads the scope from the window path", () => {
    expect(projectSessionInternals.scopeFromPathname("/w/alpha-0011223344556677/")).toBe("alpha-0011223344556677");
    expect(projectSessionInternals.scopeFromPathname("/w/alpha-0011223344556677/core-api/x")).toBe("alpha-0011223344556677");
    expect(projectSessionInternals.scopeFromPathname("/")).toBeUndefined();
    expect(projectSessionInternals.scopeFromPathname("/w/nao valido/")).toBeUndefined();
  });

  it("moves the window URL into the scope of the opened project", () => {
    setActiveWorkspaceScope("alpha-0011223344556677");

    expect(activeWorkspaceScopeId()).toBe("alpha-0011223344556677");
    expect(window.location.pathname).toBe("/w/alpha-0011223344556677/");

    // Trocar de projeto substitui o escopo em vez de aninhá-lo.
    setActiveWorkspaceScope("beta-7766554433221100");
    expect(window.location.pathname).toBe("/w/beta-7766554433221100/");

    clearActiveWorkspaceScope();
    expect(hasActiveWorkspaceScope()).toBe(false);
    expect(window.location.pathname).toBe("/");
  });
});

describe("scoped requests", () => {
  it("prefixes project requests and leaves user requests untouched", async () => {
    const fetchMock = vi.fn(async (_input: string) => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    setActiveWorkspaceScope("alpha-0011223344556677");

    await projectRuntimeFetch("/core-api/user/state/ui-session");
    await runtimeFetch("/core-api/user/settings");

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "/w/alpha-0011223344556677/core-api/user/state/ui-session",
      "/core-api/user/settings",
    ]);
  });

  /**
   * A falha precisa ser explícita: uma requisição de projeto sem escopo cairia
   * no estado global e voltaria a misturar workspaces em silêncio.
   */
  it("refuses a project request while no workspace is open", () => {
    expect(() => workspaceScopedPath("/core-api/user/state/ui-session")).toThrow(/Nenhum workspace aberto/);
  });

  it("keeps two projects on disjoint request paths", () => {
    setActiveWorkspaceScope("alpha-0011223344556677");
    const alpha = workspaceScopedPath("/core-api/workspace/resource");
    setActiveWorkspaceScope("beta-7766554433221100");
    const beta = workspaceScopedPath("/core-api/workspace/resource");

    expect(alpha).not.toBe(beta);
  });
});

describe("new window URLs", () => {
  it("opens a scoped window for a known project and a bare window otherwise", () => {
    expect(new URL(projectWindowUrl({ scopeId: "alpha-0011223344556677" })).pathname)
      .toBe("/w/alpha-0011223344556677/");
    const pending = new URL(projectWindowUrl({ pendingProjectId: "recent-1" }));
    expect(pending.pathname).toBe("/");
    expect(pending.searchParams.get("tinyideOpenProject")).toBe("recent-1");
    expect(new URL(projectWindowUrl({ projectPath: "/workspaces/alpha" })).searchParams.get("tinyideOpenProject"))
      .toBe("path:/workspaces/alpha");
  });
});
