import type {
  WorkbenchFontDefinition,
  WorkbenchFontProvider,
  WorkbenchFontTarget,
} from "@tinyide/plugin-api";
import { WORKBENCH_FONT_CSS_VARIABLES } from "@tinyide/plugin-api";
import type { TinyIdePlatform } from "../platform";

const FONT_STORAGE_KEY = "tinyide.appearance.fonts.v1";
const DESKTOP_FONT_STATE_KEY = "appearance-fonts";
const DEFAULT_EDITOR_FONT_ID = "tinyide.editor.jetbrains-mono";
const DEFAULT_INTERFACE_FONT_ID = "tinyide.interface.inter";
const DEFAULT_EDITOR_FONT_SIZE = 13;
const MIN_EDITOR_FONT_SIZE = 9;
const MAX_EDITOR_FONT_SIZE = 28;

export interface WorkbenchFontPreferences {
  readonly editorFontId: string;
  readonly interfaceFontId: string;
  readonly editorFontSize: number;
}

export const workbenchFontDefaults = {
  storageKey: FONT_STORAGE_KEY,
  editorFontId: DEFAULT_EDITOR_FONT_ID,
  interfaceFontId: DEFAULT_INTERFACE_FONT_ID,
  editorFontSize: DEFAULT_EDITOR_FONT_SIZE,
  minEditorFontSize: MIN_EDITOR_FONT_SIZE,
  maxEditorFontSize: MAX_EDITOR_FONT_SIZE,
} as const;

export function clampEditorFontSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_EDITOR_FONT_SIZE;
  return Math.min(MAX_EDITOR_FONT_SIZE, Math.max(MIN_EDITOR_FONT_SIZE, Math.round(size)));
}

export function workbenchFonts(platform: TinyIdePlatform): readonly WorkbenchFontDefinition[] {
  const providers = platform.capabilities
    .getAll<WorkbenchFontProvider>("workbench.font")
    .slice()
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0) || left.id.localeCompare(right.id));
  const selected = new Map<string, { font: WorkbenchFontDefinition; priority: number }>();
  for (const provider of providers) {
    const priority = provider.priority ?? 0;
    for (const font of provider.fonts()) {
      const previous = selected.get(font.id);
      if (!previous || priority > previous.priority) selected.set(font.id, { font, priority });
    }
  }
  return [...selected.values()]
    .map(({ font }) => font)
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.label.localeCompare(right.label));
}

export function workbenchFontsForTarget(
  fonts: readonly WorkbenchFontDefinition[],
  target: WorkbenchFontTarget,
): readonly WorkbenchFontDefinition[] {
  return fonts.filter((font) => font.target === target);
}

function normalizeFontPreferences(value: unknown): WorkbenchFontPreferences {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const editorFontId = typeof record.editorFontId === "string" && record.editorFontId.trim()
    ? record.editorFontId
    : DEFAULT_EDITOR_FONT_ID;
  const interfaceFontId = typeof record.interfaceFontId === "string" && record.interfaceFontId.trim()
    ? record.interfaceFontId
    : DEFAULT_INTERFACE_FONT_ID;
  const editorFontSize = clampEditorFontSize(Number(record.editorFontSize));
  return { editorFontId, interfaceFontId, editorFontSize };
}

export function readFontPreferences(storage: Pick<Storage, "getItem"> = localStorage): WorkbenchFontPreferences {
  try {
    const raw = storage.getItem(FONT_STORAGE_KEY);
    return normalizeFontPreferences(raw ? JSON.parse(raw) : undefined);
  } catch {
    return normalizeFontPreferences(undefined);
  }
}

export function writeFontPreferences(
  preferences: WorkbenchFontPreferences,
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  storage.setItem(FONT_STORAGE_KEY, JSON.stringify(preferences));
}

export async function readPersistedFontPreferences(): Promise<WorkbenchFontPreferences> {
  const desktop = typeof window === "undefined" ? undefined : window.tinyideDesktop;
  if (desktop?.readState) {
    try {
      const value = await desktop.readState(DESKTOP_FONT_STATE_KEY);
      if (typeof value === "string" && value.trim()) return normalizeFontPreferences(JSON.parse(value));
    } catch (error) {
      console.warn("Não foi possível restaurar as fontes da aplicação.", error);
    }
  }
  return readFontPreferences();
}

export async function persistFontPreferences(preferences: WorkbenchFontPreferences): Promise<void> {
  writeFontPreferences(preferences);
  const desktop = typeof window === "undefined" ? undefined : window.tinyideDesktop;
  if (!desktop?.writeState) return;
  try {
    await desktop.writeState(DESKTOP_FONT_STATE_KEY, JSON.stringify(preferences));
  } catch (error) {
    console.warn("Não foi possível persistir as fontes da aplicação no desktop.", error);
  }
}

export function resolveFont(
  fonts: readonly WorkbenchFontDefinition[],
  target: WorkbenchFontTarget,
  preferredFontId: string,
): WorkbenchFontDefinition | undefined {
  const candidates = workbenchFontsForTarget(fonts, target);
  const defaultId = target === "editor" ? DEFAULT_EDITOR_FONT_ID : DEFAULT_INTERFACE_FONT_ID;
  return candidates.find((font) => font.id === preferredFontId)
    ?? candidates.find((font) => font.id === defaultId)
    ?? candidates[0];
}

export function applyWorkbenchFonts(
  options: {
    readonly editorFont?: WorkbenchFontDefinition | undefined;
    readonly interfaceFont?: WorkbenchFontDefinition | undefined;
    readonly editorFontSize: number;
  },
  root: HTMLElement = document.documentElement,
): void {
  if (options.interfaceFont) {
    root.style.setProperty(WORKBENCH_FONT_CSS_VARIABLES.interface, options.interfaceFont.family);
  }
  if (options.editorFont) {
    root.style.setProperty(WORKBENCH_FONT_CSS_VARIABLES.editor, options.editorFont.family);
  }
  root.style.setProperty(
    WORKBENCH_FONT_CSS_VARIABLES.editorFontSize,
    `${clampEditorFontSize(options.editorFontSize)}px`,
  );
}
