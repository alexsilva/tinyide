import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { WorkspaceFileCreationOption } from "@tinyide/plugin-api";
import { fileCreationOptions } from "../file-creation";
import { WorkbenchIcon } from "./activity-components";

/** Usar dentro de Content/SubContent para manter as mesmas opções nos menus de criação. */
export function FileCreationMenuItems({ options, onSelect }: {
  readonly options: readonly WorkspaceFileCreationOption[];
  readonly onSelect: (option: WorkspaceFileCreationOption) => void;
}) {
  return fileCreationOptions(options).map((option) => (
    <DropdownMenu.Item
      className="menu-item"
      key={`${option.id}:${option.extension}`}
      onSelect={() => onSelect(option)}
    >
      {option.icon ? (
        <span
          className="resource-icon resource-icon--menu"
          title={option.icon.title}
          style={{
            color: option.icon.foreground ?? "currentColor",
            background: option.icon.background ?? "transparent",
          }}
        >{option.icon.label}</span>
      ) : <WorkbenchIcon icon="file" size={15} />}
      <span>{option.label}</span>
      <span className="menu-item__hint">{option.extension}</span>
    </DropdownMenu.Item>
  ));
}
