import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { assertPanelWindowReference, desktopWindowUrl } = require("./window-session.cjs");

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

describe("janelas de painel do desktop", () => {
  /**
   * Uma janela de painel apresenta uma única superfície de plugin como janela
   * real do SO. A identidade da superfície viaja na URL, como o escopo: um
   * reload reabre o mesmo painel do mesmo projeto.
   */
  it("carrega o mesmo escopo com a superfície e a view pedidas", () => {
    const url = new URL(desktopWindowUrl("http://127.0.0.1:4123/", {
      scopeId: "alfa-0011223344556677",
      panelWindow: "tool-window:git",
      panelView: "git.history",
    }));
    expect(url.pathname).toBe("/w/alfa-0011223344556677/");
    expect(url.searchParams.get("tinyidePanelWindow")).toBe("tool-window:git");
    expect(url.searchParams.get("tinyidePanelView")).toBe("git.history");
    // Janela de painel nunca "abre projeto": o escopo já existe.
    expect(url.searchParams.get("tinyideOpenProject")).toBeNull();
  });

  it("descarta uma view interna malformada sem perder a superfície", () => {
    const url = new URL(desktopWindowUrl("http://127.0.0.1:4123/", {
      scopeId: "alfa-0011223344556677",
      panelWindow: "tool-window:terminal",
      panelView: "com espaço",
    }));
    expect(url.searchParams.get("tinyidePanelWindow")).toBe("tool-window:terminal");
    expect(url.searchParams.get("tinyidePanelView")).toBeNull();
  });

  it("não deixa parâmetros de painel da URL de origem vazarem para janelas comuns", () => {
    const url = new URL(desktopWindowUrl(
      "http://127.0.0.1:4123/?tinyidePanelWindow=tool-window:git&tinyidePanelView=git.history",
      { scopeId: "beta-7766554433221100" },
    ));
    expect(url.searchParams.get("tinyidePanelWindow")).toBeNull();
    expect(url.searchParams.get("tinyidePanelView")).toBeNull();
  });

  it("exige escopo de workspace para abrir painel", () => {
    expect(() => desktopWindowUrl("http://127.0.0.1:4123/", { panelWindow: "tool-window:git" }))
      .toThrow(/exige o escopo do workspace/);
  });

  it("rejeita referências de painel malformadas vindas do IPC", () => {
    for (const panelWindow of ["", "  ", "terminal", "janela:terminal", "tool-window:", "tool-window:com espaço", `tool-window:${"x".repeat(129)}`]) {
      expect(() => assertPanelWindowReference(panelWindow)).toThrow(/Referência de painel inválida/);
    }
    expect(assertPanelWindowReference("sidebar:git.changes")).toBe("sidebar:git.changes");
    expect(assertPanelWindowReference(" tool-window:terminal ")).toBe("tool-window:terminal");
  });
});
