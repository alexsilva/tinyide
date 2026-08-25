import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { ResourceContextMenuItem } from "@tinyide/plugin-api";
import { ResourceContextMenu } from "./ResourceContextMenu";
import {
  workbenchContextMenuAriaLabel,
  type WorkbenchContextMenuTarget,
} from "./context-menu";

interface WorkbenchContextMenuState {
  readonly token: number;
  readonly target: WorkbenchContextMenuTarget;
  readonly x: number;
  readonly y: number;
  readonly items: readonly ResourceContextMenuItem[];
}

export interface WorkbenchContextMenuHandle {
  open(state: WorkbenchContextMenuState): void;
  update(token: number, items: readonly ResourceContextMenuItem[]): void;
  close(): void;
}

export interface WorkbenchContextMenuHostProps {
  readonly workspaceName: string;
  readonly disabled?: boolean;
  readonly onDismiss?: () => void;
  readonly onExecute: (item: ResourceContextMenuItem, target: WorkbenchContextMenuTarget) => void;
}

/**
 * Mantém o estado efêmero do menu fora de App. Abrir, enriquecer ou fechar o
 * popup não rerenderiza a árvore inteira do Explorer.
 */
export const WorkbenchContextMenuHost = forwardRef<WorkbenchContextMenuHandle, WorkbenchContextMenuHostProps>(
  function WorkbenchContextMenuHost({ workspaceName, disabled = false, onDismiss, onExecute }, ref) {
    const [menu, setMenu] = useState<WorkbenchContextMenuState>();

    useImperativeHandle(ref, () => ({
      open: (state) => setMenu(state),
      update: (token, items) => setMenu((current) => (
        current?.token === token ? { ...current, items } : current
      )),
      close: () => setMenu(undefined),
    }), []);

    useEffect(() => {
      if (!menu) return undefined;
      const closeOnOutsidePointer = (event: PointerEvent) => {
        const target = event.target;
        if (target instanceof Element && target.closest(".resource-context-menu")) return;
        setMenu(undefined);
        onDismiss?.();
      };
      document.addEventListener("pointerdown", closeOnOutsidePointer, true);
      return () => document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
    }, [menu, onDismiss]);

    if (!menu) return null;
    return (
      <ResourceContextMenu
        x={menu.x}
        y={menu.y}
        items={menu.items}
        disabled={disabled}
        ariaLabel={workbenchContextMenuAriaLabel(menu.target, workspaceName)}
        onExecute={(item) => {
          const target = menu.target;
          setMenu(undefined);
          onExecute(item, target);
        }}
      />
    );
  },
);
