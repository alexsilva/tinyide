import { describe, expect, it } from "vitest";
import type { WorkbenchFontDefinition, WorkbenchFontProvider } from "@tinyide/plugin-api";
import {
  applyWorkbenchFonts,
  clampEditorFontSize,
  defaultFontPreferences,
  resolveFont,
  workbenchFontDefaults,
  workbenchFonts,
  workbenchFontsForTarget,
} from "./font-manager";

function font(id: string, target: WorkbenchFontDefinition["target"], order = 0): WorkbenchFontDefinition {
  return { id, label: id, target, order, family: `"${id}", ${target === "editor" ? "monospace" : "sans-serif"}` };
}

describe("font manager", () => {
  it("keeps the highest-priority contribution for duplicate font ids", () => {
    const low: WorkbenchFontProvider = { id: "low", priority: 1, fonts: () => [font("same", "editor", 20), font("other", "editor", 10)] };
    const highFont = { ...font("same", "editor", 30), label: "override" };
    const high: WorkbenchFontProvider = { id: "high", priority: 5, fonts: () => [highFont] };
    const platform = {
      capabilities: { getAll: () => [low, high] },
    } as never;
    expect(workbenchFonts(platform)).toEqual([font("other", "editor", 10), highFont]);
  });

  it("splits catalogs by target", () => {
    const fonts = [font("mono", "editor"), font("ui", "interface")];
    expect(workbenchFontsForTarget(fonts, "editor")).toEqual([fonts[0]]);
    expect(workbenchFontsForTarget(fonts, "interface")).toEqual([fonts[1]]);
  });

  it("falls back to the builtin default when the stored id is unavailable", () => {
    const jetbrains = font(workbenchFontDefaults.editorFontId, "editor");
    expect(resolveFont([font("other", "editor"), jetbrains, font("ui", "interface")], "editor", "missing")).toBe(jetbrains);
    const first = font("only", "interface");
    expect(resolveFont([first], "interface", "missing")).toBe(first);
    expect(resolveFont([first], "editor", "missing")).toBeUndefined();
  });

  it("uses defaults when preferences are absent", () => {
    const defaults = {
      editorFontId: workbenchFontDefaults.editorFontId,
      interfaceFontId: workbenchFontDefaults.interfaceFontId,
      editorFontSize: workbenchFontDefaults.editorFontSize,
    };
    expect(defaultFontPreferences()).toEqual(defaults);
  });

  it("restores partial preferences and clamps the font size", () => {
    const preferences = defaultFontPreferences({ editorFontId: "custom", editorFontSize: 90 });
    expect(preferences.editorFontId).toBe("custom");
    expect(preferences.interfaceFontId).toBe(workbenchFontDefaults.interfaceFontId);
    expect(preferences.editorFontSize).toBe(workbenchFontDefaults.maxEditorFontSize);
    expect(clampEditorFontSize(4)).toBe(workbenchFontDefaults.minEditorFontSize);
    expect(clampEditorFontSize(Number.NaN)).toBe(workbenchFontDefaults.editorFontSize);
  });

  it("maps the selected fonts to the public CSS custom properties", () => {
    const values = new Map<string, string>();
    const root = {
      style: { setProperty: (name: string, value: string) => values.set(name, value) },
    } as unknown as HTMLElement;
    applyWorkbenchFonts({
      editorFont: font("mono", "editor"),
      interfaceFont: font("ui", "interface"),
      editorFontSize: 15,
    }, root);
    expect(values.get("--font-editor")).toBe('"mono", monospace');
    expect(values.get("--font-ui")).toBe('"ui", sans-serif');
    expect(values.get("--editor-font-size")).toBe("15px");
  });
});
