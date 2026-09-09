import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EDITOR_DEFAULT_LINE_HEIGHT, editorLineHeightPx } from "../editor-settings";

const appSource = readFileSync(new URL("../App.tsx", import.meta.url), "utf8");
const foundationCss = readFileSync(new URL("../../styles/foundation.css", import.meta.url), "utf8");
const workbenchCss = readFileSync(new URL("../../styles/workbench.css", import.meta.url), "utf8");
const featuresCss = readFileSync(new URL("../../styles/features.css", import.meta.url), "utf8");
const allCss = foundationCss + workbenchCss + featuresCss;

/**
 * O motor de layout quantiza cada line box no grid interno (1/64px no Blink): um line-height
 * fracionário como 21.45px renderiza 21.4375px por linha, enquanto espaçadores da janela de
 * sintaxe, régua e overlays multiplicam o valor nominal em JS/CSS. O desvio (~0.0125px por
 * linha) desalinha o caret do texto progressivamente em arquivos grandes. A defesa é manter a
 * altura de linha do editor sempre em px inteiros, vinda de uma única variável CSS.
 */
describe("editor line-height integrity", () => {
  it("keeps the default line height integral and derived from the shared helper", () => {
    expect(Number.isInteger(EDITOR_DEFAULT_LINE_HEIGHT)).toBe(true);
    expect(EDITOR_DEFAULT_LINE_HEIGHT).toBe(editorLineHeightPx(13));
  });

  it("produces integral line heights for the whole editor font-size range", () => {
    for (let size = 9; size <= 28; size += 1) {
      expect(Number.isInteger(editorLineHeightPx(size))).toBe(true);
    }
  });

  it("drives every editor text layer from the shared CSS variable", () => {
    // O shorthand `font:` reseta line-height; as camadas de texto do editor precisam declarar
    // a var compartilhada para caret (textarea), sintaxe, régua e diagnósticos coincidirem.
    expect(allCss).not.toContain(")/1.65 ");
    const editorFontDeclarations = allCss.match(/font: var\(--editor-font-size, 13px\)\/[^;]+;/g) ?? [];
    expect(editorFontDeclarations.length).toBeGreaterThanOrEqual(4);
    for (const declaration of editorFontDeclarations) {
      expect(declaration).toContain("/var(--editor-line-height, 21px) ");
    }
  });

  it("keeps CSS fallbacks integral and consistent with the default", () => {
    expect(allCss).not.toContain("21.45");
    expect(foundationCss).toContain("--editor-line-height: 21px;");
    expect(EDITOR_DEFAULT_LINE_HEIGHT).toBe(21);
  });

  it("never redefines the line-height variable from measured layout state", () => {
    // Reinjetar o valor medido em um ancestral do texto congelaria a medição no estado inicial
    // (o texto passaria a herdar a própria medição) e quebraria mudanças de tamanho de fonte.
    expect(appSource).not.toContain('"--editor-line-height"');
  });
});
