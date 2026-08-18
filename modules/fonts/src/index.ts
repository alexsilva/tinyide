import type {
  TinyIdeModule,
  WorkbenchFontDefinition,
  WorkbenchFontProvider,
} from "@tinyide/plugin-api";

function defineFont(
  id: string,
  label: string,
  description: string,
  target: WorkbenchFontDefinition["target"],
  order: number,
  family: string,
): WorkbenchFontDefinition {
  return { id, label, description, target, order, family };
}

export const builtinEditorFonts: readonly WorkbenchFontDefinition[] = [
  defineFont(
    "tinyide.editor.jetbrains-mono",
    "JetBrains Mono",
    "Monoespaçada com ligaduras e altura generosa, pensada para código.",
    "editor",
    10,
    '"JetBrains Mono", "Fira Code", Consolas, monospace',
  ),
  defineFont(
    "tinyide.editor.fira-code",
    "Fira Code",
    "Monoespaçada com ligaduras de programação da Mozilla.",
    "editor",
    20,
    '"Fira Code", "JetBrains Mono", Consolas, monospace',
  ),
  defineFont(
    "tinyide.editor.cascadia-code",
    "Cascadia Code",
    "Monoespaçada moderna da Microsoft, usada no Windows Terminal.",
    "editor",
    30,
    '"Cascadia Code", "Cascadia Mono", "JetBrains Mono", Consolas, monospace',
  ),
  defineFont(
    "tinyide.editor.source-code-pro",
    "Source Code Pro",
    "Monoespaçada da Adobe com formas abertas e boa legibilidade em corpos pequenos.",
    "editor",
    40,
    '"Source Code Pro", "JetBrains Mono", Consolas, monospace',
  ),
  defineFont(
    "tinyide.editor.ibm-plex-mono",
    "IBM Plex Mono",
    "Monoespaçada da família Plex, com serifas discretas nos terminais.",
    "editor",
    50,
    '"IBM Plex Mono", "JetBrains Mono", Consolas, monospace',
  ),
  defineFont(
    "tinyide.editor.system-mono",
    "Monoespaçada do sistema",
    "Usa a fonte monoespaçada padrão do sistema operacional.",
    "editor",
    60,
    'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
  ),
];

export const builtinInterfaceFonts: readonly WorkbenchFontDefinition[] = [
  defineFont(
    "tinyide.interface.inter",
    "Inter",
    "Sans-serif neutra desenhada para telas, padrão da IDE.",
    "interface",
    10,
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  ),
  defineFont(
    "tinyide.interface.system",
    "Sans-serif do sistema",
    "Usa a fonte de interface padrão do sistema operacional.",
    "interface",
    20,
    'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Ubuntu, sans-serif',
  ),
  defineFont(
    "tinyide.interface.roboto",
    "Roboto",
    "Sans-serif geométrica-humanista do Android e do ecossistema Google.",
    "interface",
    30,
    'Roboto, "Segoe UI", system-ui, sans-serif',
  ),
  defineFont(
    "tinyide.interface.ubuntu",
    "Ubuntu",
    "Sans-serif humanista da família Ubuntu, comum em desktops Linux.",
    "interface",
    40,
    'Ubuntu, Cantarell, "Segoe UI", system-ui, sans-serif',
  ),
  defineFont(
    "tinyide.interface.noto-sans",
    "Noto Sans",
    "Sans-serif do projeto Noto, com ampla cobertura de escrita.",
    "interface",
    50,
    '"Noto Sans", "Segoe UI", system-ui, sans-serif',
  ),
];

export const builtinFonts: readonly WorkbenchFontDefinition[] = [
  ...builtinEditorFonts,
  ...builtinInterfaceFonts,
];

export const builtinFontProvider: WorkbenchFontProvider = {
  id: "tinyide.builtin.fonts",
  priority: 0,
  fonts: () => builtinFonts,
};

export const fontModule: TinyIdeModule = {
  id: "fonts",
  version: "0.1.0",
  init(context) {
    context.subscriptions.push(context.extensions.registerWorkbenchFontProvider(builtinFontProvider));
  },
};
