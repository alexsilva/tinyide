import type { PointerEvent as ReactPointerEvent } from "react";
import type {
  WorkbenchStateApi,
  WorkbenchToolWindowContribution,
} from "@tinyide/plugin-api";
import {
  WorkbenchToolWindowHost,
  type WorkbenchToolWindowViewRequest,
} from "../workbench-plugin-hosts";

export interface WorkbenchToolWindowDockProps {
  readonly toolWindows: readonly WorkbenchToolWindowContribution[];
  readonly mountedIds: ReadonlySet<string>;
  readonly state: WorkbenchStateApi;
  readonly visible: boolean;
  readonly activeId: string | undefined;
  readonly height: number;
  readonly viewRequest: WorkbenchToolWindowViewRequest | undefined;
  readonly canDetach: boolean;
  readonly onClose: () => void;
  readonly onDetach: (toolWindow: WorkbenchToolWindowContribution) => void;
  readonly onResize: (event: ReactPointerEvent<HTMLDivElement>) => void;
  readonly onResetHeight: () => void;
}

/** Keeps mounted plugin tool windows alive while controlling dock visibility and detachment. */
export function WorkbenchToolWindowDock({
  toolWindows,
  mountedIds,
  state,
  visible,
  activeId,
  height,
  viewRequest,
  canDetach,
  onClose,
  onDetach,
  onResize,
  onResetHeight,
}: WorkbenchToolWindowDockProps) {
  return toolWindows
    .filter((toolWindow) => mountedIds.has(toolWindow.id))
    .map((toolWindow) => (
      <WorkbenchToolWindowHost
        key={toolWindow.id}
        provider={toolWindow}
        state={state}
        visible={visible && toolWindow.id === activeId}
        height={height}
        {...(viewRequest ? { viewRequest } : {})}
        onClose={onClose}
        {...(canDetach ? { onDetach: () => onDetach(toolWindow) } : {})}
        onResize={onResize}
        onResetHeight={onResetHeight}
      />
    ));
}
