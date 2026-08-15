import { CircleAlert, Files, Play, Plug } from "lucide-react";
import type { ReactNode } from "react";
import type { WorkbenchActivityIcon } from "@tinyide/plugin-api";
import type { ActivityBarSide, ActivityButtonDescriptor } from "../activity-layout";
import {
  FixedActivitySlot,
  IconButton,
  MovableActivityButton,
  WorkbenchActivityIconView,
  type PluginActivityButton,
} from "./activity-components";

export interface WorkbenchActivityBarProps {
  readonly side: ActivityBarSide;
  readonly items: readonly ActivityButtonDescriptor[];
  readonly pluginItems: readonly PluginActivityButton[];
  readonly activeSidebarId: string | undefined;
  readonly toolWindowVisible: boolean;
  readonly activeToolWindowId: string | undefined;
  readonly draggingKey: string | undefined;
  readonly environmentLabel: string;
  readonly environmentIcon: WorkbenchActivityIcon | undefined;
  readonly executionCount: number;
  readonly runningExecutionCount: number;
  readonly executionActive: boolean;
  readonly diagnosticsCount: number;
  readonly problemsVisible: boolean;
  readonly onPluginActivate: (item: PluginActivityButton) => void;
  readonly onBuiltinSidebarActivate: (view: "explorer" | "plugins" | "environments") => void;
  readonly onExecutionsActivate: () => void;
  readonly onProblemsActivate: () => void;
  readonly onMove: (
    key: string,
    side: ActivityBarSide,
    targetKey?: string,
    placeAfter?: boolean,
  ) => void;
  readonly onDragStateChange: (key?: string) => void;
}

export function WorkbenchActivityBar({
  side,
  items,
  pluginItems,
  activeSidebarId,
  toolWindowVisible,
  activeToolWindowId,
  draggingKey,
  environmentLabel,
  environmentIcon,
  executionCount,
  runningExecutionCount,
  executionActive,
  diagnosticsCount,
  problemsVisible,
  onPluginActivate,
  onBuiltinSidebarActivate,
  onExecutionsActivate,
  onProblemsActivate,
  onMove,
  onDragStateChange,
}: WorkbenchActivityBarProps) {
  const renderFixed = (
    itemKey: string,
    child?: ReactNode,
    spacer = false,
  ) => (
    <FixedActivitySlot
      key={itemKey}
      itemKey={itemKey}
      side={side}
      {...(draggingKey ? { draggingKey } : {})}
      spacer={spacer}
      onMove={onMove}
      onDragStateChange={onDragStateChange}
    >
      {child}
    </FixedActivitySlot>
  );

  return (
    <>
      {items.map((item) => {
        const pluginItem = pluginItems.find((candidate) => candidate.key === item.key);
        if (pluginItem) {
          const active = pluginItem.kind === "sidebar"
            ? activeSidebarId === pluginItem.id
            : toolWindowVisible && activeToolWindowId === pluginItem.id;
          return (
            <MovableActivityButton
              key={pluginItem.key}
              item={pluginItem}
              side={side}
              dragging={draggingKey === pluginItem.key}
              dragActive={Boolean(draggingKey)}
              active={active}
              label={pluginItem.kind === "toolWindow"
                ? active
                  ? `Ocultar ${pluginItem.label}`
                  : `Exibir ${pluginItem.label}`
                : pluginItem.label}
              onActivate={() => onPluginActivate(pluginItem)}
              onMove={onMove}
              onDragStateChange={onDragStateChange}
            />
          );
        }
        if (item.key === "builtin:explorer") {
          return renderFixed(item.key, (
            <IconButton label="Explorador" active={activeSidebarId === "explorer"} onClick={() => onBuiltinSidebarActivate("explorer")}>
              <Files size={16} />
            </IconButton>
          ));
        }
        if (item.key === "builtin:plugins") {
          return renderFixed(item.key, (
            <IconButton label="Plugins" active={activeSidebarId === "plugins"} onClick={() => onBuiltinSidebarActivate("plugins")}>
              <Plug size={16} />
            </IconButton>
          ));
        }
        if (item.key === "builtin:environments") {
          return renderFixed(item.key, (
            <IconButton label={environmentLabel} active={activeSidebarId === "environments"} onClick={() => onBuiltinSidebarActivate("environments")}>
              <WorkbenchActivityIconView icon={environmentIcon} />
            </IconButton>
          ));
        }
        if (item.key === "builtin:executions") {
          return renderFixed(item.key, (
            <IconButton
              label={`Execuções: ${executionCount}${runningExecutionCount ? `, ${runningExecutionCount} em execução` : ""}`}
              active={executionActive}
              onClick={onExecutionsActivate}
            >
              <Play size={16} />
              <span
                aria-hidden="true"
                className={`execution-activity__badge${runningExecutionCount ? " is-running" : ""}`}
              >{executionCount}</span>
            </IconButton>
          ));
        }
        if (item.key === "builtin:problems") {
          return renderFixed(item.key, (
            <IconButton label={`Problemas: ${diagnosticsCount}`} active={problemsVisible} onClick={onProblemsActivate}>
              <CircleAlert size={16} />
              <span className="right-activity-bar__badge" aria-hidden="true">{diagnosticsCount}</span>
            </IconButton>
          ));
        }
        return renderFixed(item.key, undefined, true);
      })}
    </>
  );
}
