import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { desktopWindowUrl } = require("./window-session.cjs");

describe("identidade das janelas do desktop", () => {
  /**
   * O que isola uma janela é o projeto que ela abre, carregado no caminho da
   * URL. Antes a identidade era um id de janela opcional: qualquer janela que o
   * omitisse caía no escopo "default" — o mesmo que uma aba de navegador usa —
   * e, como o diretório de dados do usuário é compartilhado entre o app
   * empacotado e o servidor de desenvolvimento, um host reabria o projeto do
   * outro depois de um reload.
   */
  it("ancora a janela no caminho do workspace que ela abre", () => {
    const url = new URL(desktopWindowUrl("http://127.0.0.1:4123/", {
      scopeId: "alfa-0011223344556677",
      projectPath: "/tmp/projeto alfa",
    }));
    expect(url.pathname).toBe("/w/alfa-0011223344556677/");
    expect(url.searchParams.get("tinyideOpenProject")).toBe("path:/tmp/projeto alfa");
  });

  it("abre sem escopo quando ainda não há projeto definido", () => {
    const url = new URL(desktopWindowUrl("http://127.0.0.1:4123/"));
    expect(url.pathname).toBe("/");
    expect(url.searchParams.get("tinyideOpenProject")).toBeNull();
  });

  it("não deixa um projeto pendente da URL de origem vazar para a janela nova", () => {
    const url = new URL(desktopWindowUrl(
      "http://127.0.0.1:4123/?tinyideOpenProject=path:/tmp/anterior",
      { scopeId: "beta-7766554433221100" },
    ));
    expect(url.searchParams.get("tinyideOpenProject")).toBeNull();
  });

  it("rejeita identificadores de workspace inválidos", () => {
    for (const scopeId of ["", "  ", "../fuga", "a/b", "-inicio", "Maiuscula"]) {
      expect(() => desktopWindowUrl("http://127.0.0.1:4123/", { scopeId }))
        .toThrow(/Identificador de workspace inválido/);
    }
  });
});
