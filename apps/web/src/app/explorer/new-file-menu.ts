import type { ResourceContextMenuItem, WorkspaceFileCreationOption } from "@tinyide/plugin-api";
import { fileCreationOptions, TEXT_FILE_CREATION_OPTION } from "../file-creation";

const NEW_FILE_COMMAND_PREFIX = "core.resource.newFile:";

export function encodeNewFileCommand(
  option?: Pick<WorkspaceFileCreationOption, "extension" | "suggestedName">,
): string {
  if (!option) return "core.resource.newFile";
  return `${NEW_FILE_COMMAND_PREFIX}${encodeURIComponent(JSON.stringify(option))}`;
}

export function decodeNewFileOption(
  command: string | undefined,
): Pick<WorkspaceFileCreationOption, "extension" | "suggestedName"> | undefined {
  if (!command?.startsWith(NEW_FILE_COMMAND_PREFIX)) return undefined;
  try {
    const value = JSON.parse(decodeURIComponent(command.slice(NEW_FILE_COMMAND_PREFIX.length))) as Partial<WorkspaceFileCreationOption>;
    if (typeof value.extension !== "string" || !value.extension.startsWith(".")) return undefined;
    return {
      extension: value.extension as `.${string}`,
      ...(typeof value.suggestedName === "string" ? { suggestedName: value.suggestedName } : {}),
    };
  } catch {
    return undefined;
  }
}

export function newFileContextMenuItems(
  options: readonly WorkspaceFileCreationOption[],
): readonly ResourceContextMenuItem[] {
  if (!options.length) {
    return [{
      id: "core.newFile",
      label: "Novo arquivo",
      command: encodeNewFileCommand(TEXT_FILE_CREATION_OPTION),
      group: "creation",
      order: 0,
      icon: "file",
    }];
  }
  return fileCreationOptions(options).map((option, index) => ({
    id: `core.newFile.${option.id}`,
    label: `${option.label} (${option.extension})`,
    command: encodeNewFileCommand(option),
    group: "creation",
    order: index,
    icon: "file",
  }));
}
