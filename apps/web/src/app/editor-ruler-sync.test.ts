import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const featuresCss = readFileSync(new URL("../styles/features.css", import.meta.url), "utf8");

describe("editor ruler scroll synchronization", () => {
  it("uses the ruler viewport scroll instead of translating its content", () => {
    expect(appSource).toContain("rulerViewport.scrollTop = scrollTop");
    expect(appSource).not.toContain("translate3d(0, -${scrollTop}px, 0)");
    expect(featuresCss).not.toContain("will-change: transform");
  });

  it("updates the debug-line background from the same scroll position as the ruler", () => {
    expect(appSource).toContain('editorDebugCurrentLineRef.current?.style.setProperty("--editor-scroll-top", `${scrollTop}px`)');
    expect(appSource).toContain('data-debug-line={activeDebugLine}');
    expect(featuresCss).toContain("top: calc(var(--debug-line-content-top) - var(--editor-scroll-top, 0px))");
    expect(appSource).not.toContain("(activeDebugLine - 1) * 21.45 - activeDocument.scrollTop");
  });

  it("uses the scroll position accepted by the browser after debug navigation", () => {
    expect(appSource).toContain("const actualScrollTop = scrollContainer.scrollTop");
    expect(appSource).toContain("syncEditorLineRuler(actualScrollTop)");
    expect(appSource).toContain("scrollTop: actualScrollTop");
  });

});
