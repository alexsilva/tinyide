import type {
  WorkbenchThemeDefinition,
  WorkbenchThemeProvider,
} from "@tinyide/plugin-api";
import { WORKBENCH_THEME_CSS_VARIABLES } from "@tinyide/plugin-api";
import type { TinyIdePlatform } from "../platform";

const THEME_STORAGE_KEY = "tinyide.appearance.theme.v1";
const DESKTOP_THEME_STATE_KEY = "appearance-theme";
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

export function readThemePreference(storage: Pick<Storage, "getItem"> = localStorage): string {
  try {
    const value = storage.getItem(THEME_STORAGE_KEY)?.trim();
    return value || DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

export function writeThemePreference(
  themeId: string,
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  storage.setItem(THEME_STORAGE_KEY, themeId);
}

export async function readPersistedThemePreference(): Promise<string> {
  const desktop = typeof window === "undefined" ? undefined : window.tinyideDesktop;
  if (desktop?.readState) {
    try {
      const value = await desktop.readState(DESKTOP_THEME_STATE_KEY);
      if (typeof value === "string" && value.trim()) return value;
    } catch (error) {
      console.warn("Não foi possível restaurar o tema da aplicação.", error);
    }
  }
  return readThemePreference();
}

export async function persistThemePreference(themeId: string): Promise<void> {
  writeThemePreference(themeId);
  const desktop = typeof window === "undefined" ? undefined : window.tinyideDesktop;
  if (!desktop?.writeState) return;
  try {
    await desktop.writeState(DESKTOP_THEME_STATE_KEY, themeId);
  } catch (error) {
    console.warn("Não foi possível persistir o tema da aplicação no desktop.", error);
  }
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
  storageKey: THEME_STORAGE_KEY,
  themeId: DEFAULT_THEME_ID,
} as const;
