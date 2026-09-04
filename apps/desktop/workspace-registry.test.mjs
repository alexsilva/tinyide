import {createRequire} from "node:module";
import {describe, expect, it, vi} from "vitest";

const require = createRequire(import.meta.url);
const {createWorkspaceRegistry} = require("./workspace-registry.cjs");

function registry() {
  const closed = [];
  const started = [];
  let token = 0;
  const instance = createWorkspaceRegistry({
    createToken: () => `token-${(token += 1)}`,
    startWatcher: (root, ignores) => {
      started.push({root, ignores});
      return {close: vi.fn(async () => closed.push(root))};
    },
  });
  return {instance, closed, started};
}

describe("registro de workspaces do desktop", () => {
  it("libera o workspace anterior quando a janela troca de projeto", async () => {
    const {instance, closed} = registry();

    await instance.register("/projetos/a", {owner: 1});
    await instance.register("/projetos/b", {owner: 1});

    expect(closed).toEqual(["/projetos/a"]);
    expect(instance.activeRoots()).toEqual(["/projetos/b"]);
  });

  it("mantém o workspace vivo enquanto outra janela o usa", async () => {
    const {instance, closed} = registry();

    await instance.register("/projetos/a", {owner: 1});
    await instance.register("/projetos/a", {owner: 2});
    await instance.register("/projetos/b", {owner: 1});

    expect(closed).toEqual([]);
    expect(instance.activeRoots()).toEqual(["/projetos/a", "/projetos/b"]);

    await instance.releaseOwner(2);
    expect(closed).toEqual(["/projetos/a"]);
  });

  it("invalida os tokens do workspace liberado", async () => {
    const {instance} = registry();

    const first = await instance.register("/projetos/a", {owner: 1});
    const second = await instance.register("/projetos/a", {owner: 1});
    expect(instance.resolveToken(first.token)).toBe("/projetos/a");

    await instance.register("/projetos/b", {owner: 1});

    expect(instance.resolveToken(first.token)).toBeUndefined();
    expect(instance.resolveToken(second.token)).toBeUndefined();
    expect(instance.isRegistered("/projetos/a")).toBe(false);
    expect(instance.isRegistered("/projetos/b")).toBe(true);
  });

  it("fechar a janela libera só o que era dela", async () => {
    const {instance, closed} = registry();

    await instance.register("/projetos/a", {owner: 1});
    await instance.register("/projetos/b", {owner: 2});

    expect(await instance.releaseOwner(1)).toEqual(["/projetos/a"]);
    expect(closed).toEqual(["/projetos/a"]);
    expect(instance.activeRoots()).toEqual(["/projetos/b"]);
  });

  it("recria o watcher ao reconfigurar os diretórios ignorados", async () => {
    const {instance, closed, started} = registry();

    await instance.register("/projetos/a", {owner: 1});
    await instance.configureIgnores("/projetos/a", ["build-*"]);

    expect(closed).toEqual(["/projetos/a"]);
    expect(started.at(-1)).toEqual({root: "/projetos/a", ignores: ["build-*"]});
  });

  it("mantém o watcher quando a lista de ignorados não muda de fato", async () => {
    const {instance, closed, started} = registry();

    await instance.register("/projetos/a", {owner: 1});
    // A janela recém-aberta aplica as settings padrão: lista efetiva vazia,
    // igual ao estado inicial — recriar aqui repetiria a varredura da árvore.
    await instance.configureIgnores("/projetos/a", []);
    expect(closed).toEqual([]);
    expect(started).toHaveLength(1);

    await instance.configureIgnores("/projetos/a", ["build-*", "", "build-*"]);
    expect(closed).toEqual(["/projetos/a"]);
    expect(started).toHaveLength(2);

    // Mesma lista efetiva (duplicatas e vazios não contam): nada a recriar.
    await instance.configureIgnores("/projetos/a", [" build-* "]);
    expect(started).toHaveLength(2);
  });

  it("registro sem janela dona sobrevive à troca de projeto de outra janela", async () => {
    const {instance, closed} = registry();

    // `open-window` registra o projeto antes de a janela nova existir.
    await instance.register("/projetos/novo");
    await instance.register("/projetos/a", {owner: 1});
    await instance.register("/projetos/b", {owner: 1});

    expect(closed).toEqual(["/projetos/a"]);
    expect(instance.isRegistered("/projetos/novo")).toBe(true);
  });
});
