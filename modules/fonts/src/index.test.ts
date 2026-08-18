import { describe, expect, it, vi } from "vitest";
import type { ModuleContext } from "@tinyide/plugin-api";
import { builtinEditorFonts, builtinFonts, builtinInterfaceFonts, fontModule } from "./index";

describe("font module", () => {
  it("publishes editor and interface font catalogs with unique ids", () => {
    expect(builtinEditorFonts.length).toBeGreaterThanOrEqual(3);
    expect(builtinInterfaceFonts.length).toBeGreaterThanOrEqual(3);
    expect(builtinEditorFonts.every((font) => font.target === "editor")).toBe(true);
    expect(builtinInterfaceFonts.every((font) => font.target === "interface")).toBe(true);
    expect(new Set(builtinFonts.map((font) => font.id)).size).toBe(builtinFonts.length);
  });

  it("always ends editor stacks in monospace and interface stacks in sans-serif", () => {
    for (const font of builtinEditorFonts) expect(font.family.trim().endsWith("monospace")).toBe(true);
    for (const font of builtinInterfaceFonts) expect(font.family.trim().endsWith("sans-serif")).toBe(true);
  });

  it("keeps the historical defaults as the first option of each catalog", () => {
    expect(builtinEditorFonts[0]?.id).toBe("tinyide.editor.jetbrains-mono");
    expect(builtinEditorFonts[0]?.family).toContain('"JetBrains Mono"');
    expect(builtinInterfaceFonts[0]?.id).toBe("tinyide.interface.inter");
    expect(builtinInterfaceFonts[0]?.family).toContain("Inter");
  });

  it("registers fonts only through the public extension contract", () => {
    const dispose = vi.fn();
    const registerWorkbenchFontProvider = vi.fn(() => ({ dispose }));
    const context = {
      extensions: { registerWorkbenchFontProvider },
      subscriptions: [],
    } as unknown as ModuleContext;
    fontModule.init(context);
    expect(registerWorkbenchFontProvider).toHaveBeenCalledOnce();
    expect(context.subscriptions).toHaveLength(1);
  });
});
