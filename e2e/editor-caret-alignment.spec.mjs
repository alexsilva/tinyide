import { expect, test } from "@playwright/test";
import { createWorkspace, launchIde, openFile, openProject } from "./ide-app.mjs";

const LINE_COUNT = 9_000;

/**
 * O caret é o do textarea transparente; o texto visível é o `pre.syntax-layer` virtualizado por
 * espaçadores calculados em JS. O motor quantiza cada line box no grid interno (1/64px no Blink):
 * um line-height fracionário (13px × 1.65 = 21.45px) renderizava 21.4375px por linha e o caret
 * subia ~12px a cada mil linhas em relação ao texto. Aqui a geometria real do texto do textarea
 * (reproduzida por um fantasma com o mesmo estilo) precisa coincidir com o texto virtualizado na
 * última linha de um arquivo grande.
 */
test.describe("alinhamento do caret do editor em arquivos grandes", () => {
  /** @type {Awaited<ReturnType<typeof createWorkspace>>} */
  let workspace;
  /** @type {Awaited<ReturnType<typeof launchIde>>} */
  let ide;

  test.beforeAll(async () => {
    const lines = Array.from({ length: LINE_COUNT }, (_, index) => `valor_${index + 1} = ${index + 1}`);
    workspace = await createWorkspace({ "src/grande.py": `${lines.join("\n")}\n` });
    ide = await launchIde(workspace.root);
    await openProject(ide.window);
  });

  test.afterAll(async () => {
    await ide?.close();
    await workspace?.dispose();
  });

  test("o texto virtualizado coincide com a geometria real do textarea no fim do arquivo", async () => {
    const { window } = ide;
    await openFile(window, "src/grande.py");
    const editor = window.locator("textarea.code-editor--highlighted");
    await expect(editor).toHaveValue(new RegExp(`valor_${LINE_COUNT} = ${LINE_COUNT}`), { timeout: 30_000 });

    // Line-height fracionário quantiza diferente entre texto e espaçadores; precisa ser inteiro
    // e idêntico nas duas camadas.
    const lineHeights = await window.evaluate(() => [
      window.getComputedStyle(document.querySelector("textarea.code-editor--highlighted")).lineHeight,
      window.getComputedStyle(document.querySelector(".syntax-layer")).lineHeight,
    ]);
    expect(lineHeights[0]).toMatch(/^\d+px$/);
    expect(lineHeights[1]).toBe(lineHeights[0]);

    // Rola até o fim para a janela de sintaxe materializar a última linha.
    await window.locator(".highlight-editor").evaluate((scroller) => {
      scroller.scrollTop = scroller.scrollHeight;
    });
    const lastLineText = `valor_${LINE_COUNT} = ${LINE_COUNT}`;
    await window.waitForFunction(
      (needle) => document.querySelector(".syntax-layer")?.textContent?.includes(needle) ?? false,
      lastLineText,
      { timeout: 15_000 },
    );

    const measured = await window.evaluate(({ lineCount, needle }) => {
      const textarea = document.querySelector("textarea.code-editor--highlighted");
      const layer = document.querySelector(".syntax-layer");
      const style = window.getComputedStyle(textarea);
      const textareaRect = textarea.getBoundingClientRect();

      // Fantasma sobreposto à área de conteúdo do textarea, com o mesmo estilo de texto: mesma
      // engine e mesmo estilo reproduzem a quantização por linha real, ou seja, onde o caret
      // nativo de fato desenha cada linha.
      const ghost = document.createElement("div");
      ghost.style.position = "fixed";
      ghost.style.top = `${textareaRect.top + (Number.parseFloat(style.paddingTop) || 0)}px`;
      ghost.style.left = `${textareaRect.left + (Number.parseFloat(style.paddingLeft) || 0)}px`;
      ghost.style.margin = "0";
      ghost.style.visibility = "hidden";
      ghost.style.whiteSpace = "pre";
      ghost.style.fontFamily = style.fontFamily;
      ghost.style.fontSize = style.fontSize;
      ghost.style.fontWeight = style.fontWeight;
      ghost.style.lineHeight = style.lineHeight;
      ghost.style.letterSpacing = style.letterSpacing;
      ghost.style.tabSize = style.tabSize;
      ghost.textContent = textarea.value;
      document.body.appendChild(ghost);
      const realLineHeight = ghost.getBoundingClientRect().height / lineCount;

      // Rect do mesmo trecho de texto nas duas geometrias (font box com font box).
      const needleRectIn = (root) => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let top;
        let node;
        while ((node = walker.nextNode())) {
          const index = node.data.indexOf(needle);
          if (index < 0) continue;
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + 1);
          top = range.getBoundingClientRect().top;
        }
        return top;
      };
      const caretTop = needleRectIn(ghost);
      const syntaxTop = needleRectIn(layer);
      ghost.remove();
      return { caretTop, syntaxTop, realLineHeight };
    }, { lineCount: LINE_COUNT, needle: `valor_${LINE_COUNT}` });

    expect(measured.caretTop).toBeDefined();
    expect(measured.syntaxTop).toBeDefined();
    // Antes da correção o desvio aqui era ~112px (9.000 linhas × 0.0125px); alinhado, fica em 0.
    expect(Math.abs(measured.syntaxTop - measured.caretTop)).toBeLessThanOrEqual(1.5);
    // E a altura real por linha é exatamente o valor nominal declarado (px inteiro).
    expect(measured.realLineHeight).toBeCloseTo(Number.parseFloat(lineHeights[0]), 3);
  });
});
