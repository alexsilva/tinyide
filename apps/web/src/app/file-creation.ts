import type { WorkspaceFileCreationOption } from "@tinyide/plugin-api";

export const TEXT_FILE_CREATION_OPTION: WorkspaceFileCreationOption = {
  id: "core.text",
  label: "Arquivo de texto",
  extension: ".txt",
  suggestedName: "novo.txt",
  description: "Arquivo de texto simples",
  order: -1000,
};

export function fileCreationOptions(
  pluginOptions: readonly WorkspaceFileCreationOption[],
): readonly WorkspaceFileCreationOption[] {
  return [TEXT_FILE_CREATION_OPTION, ...pluginOptions];
}

export function ensureFileCreationExtension(name: string, extension: `.${string}`): string {
  return name.toLocaleLowerCase().endsWith(extension.toLocaleLowerCase())
    ? name
    : `${name}${extension}`;
}

export function nextUntitledFileName(
  existingNames: readonly string[],
  extension: `.${string}` = TEXT_FILE_CREATION_OPTION.extension,
): string {
  const normalized = new Set(existingNames.map((name) => name.toLocaleLowerCase()));
  let sequence = 1;
  while (true) {
    const candidate = sequence === 1
      ? `sem-titulo${extension}`
      : `sem-titulo-${sequence}${extension}`;
    if (!normalized.has(candidate.toLocaleLowerCase())) return candidate;
    sequence += 1;
  }
}
