import type { ResourceContextMenuItem } from "@tinyide/plugin-api";
import { WorkbenchIcon } from "./activity-components";

function contextMenuIcon(item: ResourceContextMenuItem) {
  return item.icon === "play" ? "play"
    : item.icon === "folder" ? "folder-open"
      : item.icon === "copy" ? "copy"
        : item.icon === "terminal" ? "terminal"
          : item.icon === "save" ? "save"
            : item.icon === "close" ? "close"
              : item.icon === "plus" ? "plus"
                : item.icon === "undo" ? "undo"
                  : item.icon === "diff" ? "diff"
                    : "file";
}

export interface ResourceContextMenuProps {
  readonly x: number;
  readonly y: number;
  readonly items: readonly ResourceContextMenuItem[];
  readonly ariaLabel?: string;
  readonly disabled?: boolean;
  readonly onExecute: (item: ResourceContextMenuItem) => void;
}

export function ResourceContextMenu({ x, y, items, ariaLabel, disabled = false, onExecute }: ResourceContextMenuProps) {
  return (
    <div
      className="menu-content resource-context-menu"
      role="menu"
      aria-label={ariaLabel}
      style={{ left: x, top: y }}
    >
      {items.map((item, index) => {
        const previous = items[index - 1];
        const separated = previous && previous.group !== item.group;
        return (
          <div key={item.id}>
            {separated ? <div className="menu-separator" /> : null}
            <button
              className="menu-item resource-context-menu__item"
              type="button"
              role="menuitem"
              disabled={disabled}
              onClick={() => onExecute(item)}
            >
              <WorkbenchIcon icon={contextMenuIcon(item)} size={14} />
              <span>{item.label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
