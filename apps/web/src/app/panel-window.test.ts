// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  activePanelWindowReference,
  activePanelWindowViewId,
  isPanelWindow,
  panelWindowDocumentTitle,
  parsePanelWindowReference,
  serializePanelWindowReference,
} from "./panel-window";

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("referência de janela de painel", () => {
  it("faz ida e volta entre referência e forma serializada", () => {
    for (const reference of [
      { kind: "tool-window", id: "terminal" } as const,
      { kind: "tool-window", id: "git" } as const,
      { kind: "sidebar", id: "git.changes" } as const,
      { kind: "panel", id: "markdown.preview" } as const,
    ]) {
      expect(parsePanelWindowReference(serializePanelWindowReference(reference))).toEqual(reference);
    }
  });

  /**
   * O valor chega pela URL, então é entrada não confiável: um tipo desconhecido
   * ou um id fora do alfabeto de contribuições não pode virar modo painel — a
   * janela abriria vazia sem explicação.
   */
  it("rejeita referências malformadas em vez de adivinhar", () => {
    for (const raw of [
      undefined,
      null,
      "",
      "   ",
      "terminal",
      ":terminal",
      "tool-window:",
      "janela:terminal",
      "tool-window:com espaço",
      "tool-window:../fuga",
      `tool-window:${"x".repeat(129)}`,
    ]) {
      expect(parsePanelWindowReference(raw)).toBeUndefined();
    }
  });

  it("aceita ids de contribuição com ponto e dois-pontos", () => {
    expect(parsePanelWindowReference("sidebar:git.changes")).toEqual({ kind: "sidebar", id: "git.changes" });
    expect(parsePanelWindowReference("tool-window:plugin:view")).toEqual({ kind: "tool-window", id: "plugin:view" });
  });
});

describe("identidade da janela atual", () => {
  it("lê a superfície e a view interna da própria URL", () => {
    window.history.replaceState(
      null,
      "",
      "/w/alpha-0011223344556677/?tinyidePanelWindow=tool-window:git&tinyidePanelView=git.history",
    );
    expect(activePanelWindowReference()).toEqual({ kind: "tool-window", id: "git" });
    expect(activePanelWindowViewId()).toBe("git.history");
    expect(isPanelWindow()).toBe(true);
  });

  it("trata janelas comuns como não sendo de painel", () => {
    window.history.replaceState(null, "", "/w/alpha-0011223344556677/");
    expect(activePanelWindowReference()).toBeUndefined();
    expect(activePanelWindowViewId()).toBeUndefined();
    expect(isPanelWindow()).toBe(false);
  });

  it("ignora view interna malformada sem descartar a superfície", () => {
    window.history.replaceState(
      null,
      "",
      "/?tinyidePanelWindow=tool-window:terminal&tinyidePanelView=com%20espa%C3%A7o",
    );
    expect(activePanelWindowReference()).toEqual({ kind: "tool-window", id: "terminal" });
    expect(activePanelWindowViewId()).toBeUndefined();
  });
});

describe("título da janela de painel", () => {
  it("inclui o projeto quando há um aberto", () => {
    expect(panelWindowDocumentTitle("TERMINAL", "meu-projeto")).toBe("TERMINAL — meu-projeto");
    expect(panelWindowDocumentTitle("TERMINAL", "Sem workspace")).toBe("TERMINAL");
    expect(panelWindowDocumentTitle("TERMINAL", "")).toBe("TERMINAL");
  });
});
