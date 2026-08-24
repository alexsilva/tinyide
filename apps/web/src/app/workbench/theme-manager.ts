import type {
  WorkbenchThemeDefinition,
  WorkbenchThemeProvider,
} from "@tinyide/plugin-api";
import { WORKBENCH_THEME_CSS_VARIABLES } from "@tinyide/plugin-api";
import type { TinyIdePlatform } from "../platform";

const DEFAULT_THEME_ID = "tinyide.neutral";

export const THEME_TOKEN_CSS_PROPERTIES = WORKBENCH_THEME_CSS_VARIABLES;

export function workbenchThemes(platform: TinyIdePlatform): readonly WorkbenchThemeDefinition[] {
  const providers = platform.capabilities
    .getAll<WorkbenchThemeProvider>("workbench.theme")
    .slice()
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0) || left.id.localeCompare(right.id));
  const selected = new Map<string, { theme: WorkbenchThemeDefinition; priority: number }>();
  for (const provider of providers) {
    const priority = provider.priority ?? 0;
    for (const theme of provider.themes()) {
      const previous = selected.get(theme.id);
      if (!previous || priority > previous.priority) selected.set(theme.id, { theme, priority });
    }
  }
  return [...selected.values()]
    .map(({ theme }) => theme)
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.label.localeCompare(right.label));
}

export function resolveTheme(
  themes: readonly WorkbenchThemeDefinition[],
  preferredThemeId: string,
): WorkbenchThemeDefinition | undefined {
  return themes.find((theme) => theme.id === preferredThemeId)
    ?? themes.find((theme) => theme.id === DEFAULT_THEME_ID)
    ?? themes[0];
}

export function applyWorkbenchTheme(
  theme: WorkbenchThemeDefinition,
  root: HTMLElement = document.documentElement,
): void {
  root.dataset.theme = theme.id;
  root.dataset.themeAppearance = theme.appearance;
  root.style.colorScheme = theme.appearance === "light" ? "light" : "dark";
  for (const [token, property] of Object.entries(THEME_TOKEN_CSS_PROPERTIES) as Array<[
    keyof WorkbenchThemeDefinition["tokens"],
    string,
  ]>) {
    root.style.setProperty(property, theme.tokens[token]);
  }
}

export const workbenchThemeDefaults = {
  themeId: DEFAULT_THEME_ID,
} as const;
