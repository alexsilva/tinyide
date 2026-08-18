import { describe, expect, it } from "vitest";

import { foldSearchMatchVisible, foldSearchVisibleLine, foldsRevealingFileLine } from "./fold-search";
import type { FoldSearchProjection } from "./fold-search";

const source = ["um", "dois", "tres", "quatro", "cinco"].join("\n");

// Dobra de 2..4: a linha 2 (cabeçalho) continua visível, 3 e 4 viram marcador na linha visível 3.
const projection: FoldSearchProjection = {
  hiddenLineByFileLine: [false, false, true, true, false],
  visibleLineByFileLine: [1, 2, 3, 3, 4],
};

describe("foldsRevealingFileLine", () => {
  const folds = [
    { id: "f1", startLine: 2, endLine: 4 },
    { id: "f2", startLine: 8, endLine: 12 },
  ];

  it("remove a dobra que esconde a linha", () => {
    expect(foldsRevealingFileLine(folds, 3).map((fold) => fold.id)).toEqual(["f2"]);
  });

  it("mantem a dobra quando a linha e o proprio cabecalho", () => {
    expect(foldsRevealingFileLine(folds, 2).map((fold) => fold.id)).toEqual(["f1", "f2"]);
  });

  it("mantem todas as dobras quando a linha ja esta visivel", () => {
    expect(foldsRevealingFileLine(folds, 5).map((fold) => fold.id)).toEqual(["f1", "f2"]);
  });

  it("remove tambem as dobras aninhadas que cobrem a linha", () => {
    const nested = [
      { id: "externa", startLine: 1, endLine: 20 },
      { id: "interna", startLine: 5, endLine: 9 },
      { id: "outra", startLine: 30, endLine: 40 },
    ];
    expect(foldsRevealingFileLine(nested, 7).map((fold) => fold.id)).toEqual(["outra"]);
  });
});

describe("foldSearchVisibleLine", () => {
  it("traduz a linha do arquivo para a linha visivel", () => {
    expect(foldSearchVisibleLine(projection, 5)).toBe(4);
  });

  it("usa a propria linha quando nao ha dobras", () => {
    expect(foldSearchVisibleLine(undefined, 5)).toBe(5);
  });
});

describe("foldSearchMatchVisible", () => {
  it("aceita match fora dos blocos dobrados", () => {
    const start = source.indexOf("cinco");
    expect(foldSearchMatchVisible(source, projection, { start, end: start + 5 })).toBe(true);
  });

  it("rejeita match dentro de um bloco dobrado", () => {
    const start = source.indexOf("tres");
    expect(foldSearchMatchVisible(source, projection, { start, end: start + 4 })).toBe(false);
  });

  it("rejeita match que comeca visivel e termina oculto", () => {
    const start = source.indexOf("dois");
    expect(foldSearchMatchVisible(source, projection, { start, end: source.indexOf("tres") + 4 })).toBe(false);
  });

  it("aceita qualquer match quando nao ha projecao", () => {
    expect(foldSearchMatchVisible(source, undefined, { start: 0, end: 2 })).toBe(true);
  });

  it("rejeita quando nao ha match", () => {
    expect(foldSearchMatchVisible(source, projection, undefined)).toBe(false);
  });
});
