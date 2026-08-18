import { describe, expect, it } from "vitest";

import { editorContextMenuTargetRange, editorWordRangeAtOffset } from "./context-target";

const source = "magalu_config_default,\nmeli_config_default,\n";

describe("editorWordRangeAtOffset", () => {
  it("expande a palavra a partir de um offset interno", () => {
    expect(editorWordRangeAtOffset(source, 5)).toEqual({ start: 0, end: 21 });
  });

  it("usa a palavra anterior quando o offset está logo após ela", () => {
    expect(editorWordRangeAtOffset(source, 21)).toEqual({ start: 0, end: 21 });
  });

  it("devolve um único caractere fora de palavras", () => {
    expect(editorWordRangeAtOffset(source, 22)).toEqual({ start: 22, end: 23 });
  });

  it("limita o offset ao tamanho do texto", () => {
    expect(editorWordRangeAtOffset(source, 9999)).toEqual({ start: source.length, end: source.length });
  });
});

describe("editorContextMenuTargetRange", () => {
  it("não realça nada quando já existe uma seleção", () => {
    expect(editorContextMenuTargetRange(source, 7, 13)).toBeUndefined();
  });

  it("usa a palavra sob o caret colapsado", () => {
    expect(editorContextMenuTargetRange(source, 5, 5)).toEqual({ start: 0, end: 21 });
  });

  it("cobre a palavra quando o caret está na borda dela", () => {
    expect(editorContextMenuTargetRange(source, 0, 0)).toEqual({ start: 0, end: 21 });
    expect(editorContextMenuTargetRange(source, 21, 21)).toEqual({ start: 0, end: 21 });
  });

  it("não devolve alvo fora de uma palavra", () => {
    expect(editorContextMenuTargetRange(source, 22, 22)).toBeUndefined();
  });

  it("aceita identificadores com dígitos, acentos e cifrão", () => {
    const identifiers = "magis5_linked configuração $escopo";
    expect(editorContextMenuTargetRange(identifiers, 3, 3)).toEqual({ start: 0, end: 13 });
    expect(editorContextMenuTargetRange(identifiers, 18, 18)).toEqual({ start: 14, end: 26 });
    expect(editorContextMenuTargetRange(identifiers, 30, 30)).toEqual({ start: 27, end: 34 });
  });

  it("limita offsets inválidos ao texto", () => {
    expect(editorContextMenuTargetRange(source, -5, -5)).toEqual({ start: 0, end: 21 });
    expect(editorContextMenuTargetRange(source, 9999, 9999)).toBeUndefined();
  });

  it("trata seleção invertida como caret colapsado no início", () => {
    expect(editorContextMenuTargetRange(source, 5, 2)).toEqual({ start: 0, end: 21 });
  });
});
