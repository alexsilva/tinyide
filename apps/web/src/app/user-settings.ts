import type { PluginSettingsMap } from "@tinyide/plugin-api";
import { projectRuntimeFetch } from "./project-session";
import type { WorkspaceEditorSettings } from "./workspace-settings";
import type { WorkbenchFontPreferences } from "./workbench/font-manager";

export interface UserAppearanceSettings {
  readonly themeId?: string;
  readonly iconPackId?: string;
  readonly fonts?: Partial<WorkbenchFontPreferences>;
}

export interface UserSettings {
  readonly version: 1;
  /** User defaults inherited by every project unless the project overrides them. */
  readonly editor?: WorkspaceEditorSettings;
  /** User defaults for plugin settings. Project-local values override individual keys. */
  readonly plugins?: PluginSettingsMap;
  /** Application-wide visual preferences. These never belong to a project. */
  readonly appearance?: UserAppearanceSettings;
  /** Private persistent plugin data. Managed through the plugin configuration API and stored in this same file. */
  readonly pluginData?: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
}

export const EMPTY_USER_SETTINGS: UserSettings = { version: 1 };

export function mergePluginSettings(
  user: PluginSettingsMap | undefined,
  project: PluginSettingsMap | undefined,
): PluginSettingsMap {
  const pluginIds = new Set([...Object.keys(user ?? {}), ...Object.keys(project ?? {})]);
  return Object.fromEntries([...pluginIds].map((pluginId) => [
    pluginId,
    {
      ...(user?.[pluginId] ?? {}),
      ...(project?.[pluginId] ?? {}),
    },
  ]));
}

export async function readUserSettings(): Promise<UserSettings> {
  const response = await projectRuntimeFetch("/core-api/user/settings", { cache: "no-store" });
  const payload = await response.json() as UserSettings | { readonly error?: string };
  if (!response.ok) {
    throw new Error("error" in payload && payload.error
      ? payload.error
      : "Não foi possível ler as configurações do usuário.");
  }
  return payload as UserSettings;
}

export async function writeUserSettings(settings: UserSettings): Promise<UserSettings> {
  const response = await projectRuntimeFetch("/core-api/user/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  const payload = await response.json() as UserSettings | { readonly error?: string };
  if (!response.ok) {
    throw new Error("error" in payload && payload.error
      ? payload.error
      : "Não foi possível salvar as configurações do usuário.");
  }
  return payload as UserSettings;
}
