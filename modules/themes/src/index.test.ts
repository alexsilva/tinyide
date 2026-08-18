import { describe, expect, it, vi } from "vitest";
import type { ModuleContext } from "@tinyide/plugin-api";
import { builtinThemes, themeModule } from "./index";

function luminance(hex: string): number {
  const channels = hex.match(/[a-f\d]{2}/gi)?.map((part) => Number.parseInt(part, 16) / 255) ?? [];
  const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * (linear[0] ?? 0) + 0.7152 * (linear[1] ?? 0) + 0.0722 * (linear[2] ?? 0);
}

function contrast(foreground: string, background: string): number {
  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
}

describe("theme module", () => {
  it("publishes exactly the three native themes", () => {
    expect(builtinThemes.map((theme) => [theme.id, theme.label, theme.appearance])).toEqual([
      ["tinyide.light", "Claro", "light"],
      ["tinyide.neutral", "Neutro", "neutral"],
      ["tinyide.dark", "Escuro", "dark"],
    ]);
    expect(builtinThemes.every((theme) => Object.keys(theme.tokens).length === Object.keys(builtinThemes[0]!.tokens).length)).toBe(true);
  });

  it("registers themes only through the public extension contract", () => {
    const dispose = vi.fn();
    const registerWorkbenchThemeProvider = vi.fn(() => ({ dispose }));
    const context = {
      extensions: { registerWorkbenchThemeProvider },
      subscriptions: [],
    } as unknown as ModuleContext;
    themeModule.init(context);
    expect(registerWorkbenchThemeProvider).toHaveBeenCalledOnce();
    expect(context.subscriptions).toHaveLength(1);
  });

  it("keeps the light theme readable on its primary surfaces", () => {
    const light = builtinThemes.find((theme) => theme.id === "tinyide.light")!;
    for (const foreground of [light.tokens.text, light.tokens.textMuted, light.tokens.textSubtle]) {
      for (const background of [light.tokens.surface1, light.tokens.surface2, light.tokens.surfaceEditor, light.tokens.surfaceSidebar]) {
        expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(contrast(light.tokens.editorForeground, light.tokens.surfaceEditor)).toBeGreaterThanOrEqual(7);
  });

  it("keeps the light theme deliberately below white-level luminance", () => {
    const light = builtinThemes.find((theme) => theme.id === "tinyide.light")!;
    const primarySurfaces = [
      light.tokens.background,
      light.tokens.surface1,
      light.tokens.surface2,
      light.tokens.surfaceRaised,
      light.tokens.surfaceEditor,
      light.tokens.surfaceSidebar,
      light.tokens.surfaceTitlebar,
      light.tokens.surfaceActivityBar,
    ];
    expect(Math.max(...primarySurfaces.map(luminance))).toBeLessThan(0.75);
    expect(primarySurfaces).not.toContain("#ffffff");
  });
});
