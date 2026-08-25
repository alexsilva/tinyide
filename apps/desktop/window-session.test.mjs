import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { DESKTOP_MAIN_SESSION_ID, desktopWindowUrl } = require("./window-session.cjs");

describe("identidade de sessão das janelas do desktop", () => {
  it("nunca deixa a janela principal herdar o id de sessão padrão", () => {
    // "default" é o id que qualquer aba de navegador sem parâmetro usa; como o
    // diretório de estado do usuário é compartilhado entre o app empacotado e o
    // servidor de desenvolvimento, colidir aqui faz um host reabrir o projeto
    // do outro depois de um reload.
    expect(DESKTOP_MAIN_SESSION_ID).not.toBe("default");
    const url = new URL(desktopWindowUrl("http://127.0.0.1:4123/", { sessionId: DESKTOP_MAIN_SESSION_ID }));
    expect(url.searchParams.get("tinyideSession")).toBe(DESKTOP_MAIN_SESSION_ID);
    expect(url.searchParams.get("tinyideOpenProject")).toBeNull();
  });

  it("carrega o projeto solicitado sem perder a identidade da sessão", () => {
    const url = new URL(desktopWindowUrl("http://127.0.0.1:4123/", {
      sessionId: "6f1a2b3c",
      projectPath: "/tmp/projeto alfa",
    }));
    expect(url.searchParams.get("tinyideSession")).toBe("6f1a2b3c");
    expect(url.searchParams.get("tinyideOpenProject")).toBe("path:/tmp/projeto alfa");
  });

  it("não deixa um projeto pendente da URL de origem vazar para a janela nova", () => {
    const url = new URL(desktopWindowUrl(
      "http://127.0.0.1:4123/?tinyideOpenProject=path:/tmp/anterior",
      { sessionId: "outra-sessao" },
    ));
    expect(url.searchParams.get("tinyideOpenProject")).toBeNull();
  });

  it("rejeita identificadores de sessão inválidos", () => {
    for (const sessionId of [undefined, "", "  ", "../fuga", "a/b", "-inicio"]) {
      expect(() => desktopWindowUrl("http://127.0.0.1:4123/", { sessionId }))
        .toThrow(/Identificador de sessão inválido/);
    }
  });
});
