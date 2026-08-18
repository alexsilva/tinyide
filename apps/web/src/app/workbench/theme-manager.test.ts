import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WORKBENCH_THEME_CSS_VARIABLES,
  type WorkbenchThemeDefinition,
  type WorkbenchThemeProvider,
} from "@tinyide/plugin-api";
import {
  applyWorkbenchTheme,
  readThemePreference,
  resolveTheme,
  workbenchThemes,
  workbenchThemeDefaults,
} from "./theme-manager";

function theme(id: string, order = 0): WorkbenchThemeDefinition {
  return {
    id,
    label: id,
    appearance: id.includes("light") ? "light" : "dark",
    order,
    tokens: {
      background: "#000", surface1: "#001", surface2: "#002", surface3: "#003", surface4: "#004",
      surfaceRaised: "#005", surfaceInput: "#006", surfaceEditor: "#007", surfacePanel: "#008",
      surfaceSidebar: "#009", surfaceTitlebar: "#00a", surfaceActivityBar: "#00b", surfaceStatusbar: "#00c",
      border: "#111", borderStrong: "#222", text: "#eee", textMuted: "#aaa", textSubtle: "#888",
      textInverse: "#fff", accent: "#55f", accentStrong: "#66f", accentSoft: "#225", danger: "#f55",
      dangerSoft: "#522", success: "#5f5", successSoft: "#252", warning: "#fa5", information: "#5af",
      directory: "#fb5", scrollbarThumb: "#444", scrollbarThumbHover: "#555", selection: "#6699",
      editorForeground: "#eee", editorCaret: "#fff", syntaxKeyword: "#f0f", syntaxString: "#f88",
      syntaxNumber: "#8f8", syntaxComment: "#696", syntaxFunction: "#ff8", syntaxClass: "#8ff",
      syntaxDecorator: "#fc8", syntaxBuiltin: "#6cf", syntaxOperator: "#ddd",
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("theme manager", () => {
  it("keeps the highest-priority contribution for duplicate theme ids", () => {
    const low: WorkbenchThemeProvider = { id: "low", priority: 1, themes: () => [theme("same", 20), theme("other", 10)] };
    const highTheme = { ...theme("same", 30), label: "override" };
    const high: WorkbenchThemeProvider = { id: "high", priority: 5, themes: () => [highTheme] };
    const platform = {
      capabilities: { getAll: () => [low, high] },
    } as never;
    expect(workbenchThemes(platform)).toEqual([theme("other", 10), highTheme]);
  });

  it("falls back to the neutral builtin theme when the stored id is unavailable", () => {
    const neutral = theme(workbenchThemeDefaults.themeId);
    expect(resolveTheme([theme("other"), neutral], "missing")).toBe(neutral);
  });

  it("uses the neutral theme when storage is empty or unavailable", () => {
    expect(readThemePreference({ getItem: () => null })).toBe(workbenchThemeDefaults.themeId);
    expect(readThemePreference({ getItem: () => { throw new Error("blocked"); } })).toBe(workbenchThemeDefaults.themeId);
  });

  it("maps theme tokens to CSS custom properties and appearance metadata", () => {
    const selected = theme("tinyide.light");
    const values = new Map<string, string>();
    const root = {
      dataset: {},
      style: {
        colorScheme: "",
        setProperty: (name: string, value: string) => values.set(name, value),
      },
    } as unknown as HTMLElement;
    applyWorkbenchTheme(selected, root);
    expect(root.dataset.theme).toBe("tinyide.light");
    expect(root.dataset.themeAppearance).toBe("light");
    expect(root.style.colorScheme).toBe("light");
    expect(values.get("--bg")).toBe(selected.tokens.background);
    expect(values.get("--surface-editor")).toBe(selected.tokens.surfaceEditor);
    expect(values.get("--syntax-keyword")).toBe(selected.tokens.syntaxKeyword);
    expect(values.get(WORKBENCH_THEME_CSS_VARIABLES.surfacePanel)).toBe(selected.tokens.surfacePanel);
    expect(values.get(WORKBENCH_THEME_CSS_VARIABLES.text)).toBe(selected.tokens.text);
    expect(values.get(WORKBENCH_THEME_CSS_VARIABLES.accent)).toBe(selected.tokens.accent);
  });
});
