import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  listWorkspaceScopes,
  readWorkspaceScope,
  registerWorkspaceScope,
  removeWorkspaceScope,
  workspaceScopeDirectory,
  workspaceScopeId,
} from "./workspace-scope.mjs";

const roots = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function testRoot() {
  const root = await mkdtemp(join(tmpdir(), "tinyide-scope-"));
  roots.push(root);
  return root;
}

describe("workspace scope", () => {
  it("derives one stable id per directory, insensitive to path spelling", () => {
    expect(workspaceScopeId("/projetos/alpha")).toBe(workspaceScopeId("/projetos/alpha/"));
    expect(workspaceScopeId("/projetos/alpha")).toBe(workspaceScopeId("/projetos/./alpha"));
    expect(workspaceScopeId("/projetos/alpha")).not.toBe(workspaceScopeId("/projetos/beta"));
    // O slug legível existe para inspeção manual do diretório de estado.
    expect(workspaceScopeId("/projetos/alpha")).toMatch(/^alpha-[0-9a-f]{16}$/);
    expect(workspaceScopeId("/projetos/Nome Com Espaço")).toMatch(/^nome-com-espa-o-[0-9a-f]{16}$/);
  });

  it("registers and resolves a workspace by id", async () => {
    const root = await testRoot();
    const descriptor = await registerWorkspaceScope(root, "/projetos/alpha", { now: 1 });

    expect(descriptor).toMatchObject({ path: "/projetos/alpha", name: "alpha", createdAt: 1 });
    await expect(readWorkspaceScope(root, descriptor.scopeId)).resolves.toMatchObject({
      path: "/projetos/alpha",
      name: "alpha",
    });
    // Reabrir preserva a data de criação e atualiza o último acesso.
    await expect(registerWorkspaceScope(root, "/projetos/alpha", { now: 5 }))
      .resolves.toMatchObject({ createdAt: 1, lastOpenedAt: 5 });
  });

  /**
   * Um descritor cujo caminho não gera o próprio id só aparece se o diretório
   * foi copiado ou editado à mão. Honrá-lo entregaria a uma janela o estado de
   * outro projeto — exatamente a falha que o escopo existe para impedir.
   */
  it("discards a descriptor whose path does not match its own id", async () => {
    const root = await testRoot();
    const scopeId = workspaceScopeId("/projetos/alpha");
    await mkdir(workspaceScopeDirectory(root, scopeId), { recursive: true });
    await writeFile(
      join(workspaceScopeDirectory(root, scopeId), "workspace.json"),
      JSON.stringify({ version: 1, scopeId, path: "/projetos/beta", name: "beta" }),
    );

    await expect(readWorkspaceScope(root, scopeId)).resolves.toBeUndefined();
  });

  it("lists and removes registered scopes", async () => {
    const root = await testRoot();
    const alpha = await registerWorkspaceScope(root, "/projetos/alpha");
    await registerWorkspaceScope(root, "/projetos/beta");

    await expect(listWorkspaceScopes(root)).resolves.toHaveLength(2);
    await removeWorkspaceScope(root, alpha.scopeId);
    await expect(listWorkspaceScopes(root)).resolves.toEqual([
      expect.objectContaining({ name: "beta" }),
    ]);
    await expect(listWorkspaceScopes(join(root, "vazio"))).resolves.toEqual([]);
  });

  it("refuses ids that could escape the state directory", async () => {
    const root = await testRoot();
    expect(() => workspaceScopeDirectory(root, "../escape")).toThrow("Identificador de workspace inválido");
    expect(() => workspaceScopeDirectory(root, "com espaço")).toThrow("Identificador de workspace inválido");
  });
});
