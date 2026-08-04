import { useMemo } from "react";
import type {
  WorkbenchExplorerFilterProvider,
  WorkbenchPanelHook,
  WorkbenchSidebarHook,
  WorkbenchStatusbarContribution,
  WorkbenchTitlebarContribution,
  WorkbenchToolWindowHook,
} from "@tinyide/plugin-api";
import { platform } from "../platform";
import type { PluginActivityButton } from "./activity-components";
import {
  expandWorkbenchPanelContribution,
  expandWorkbenchToolWindowContribution,
} from "./plugin-contributions";

export function useWorkbenchContributions(revision: unknown) {
  const sidebars = useMemo(() => platform.capabilities
    .getAll<WorkbenchSidebarHook>("workbench.sidebar.hook")
    .flatMap((hook) => hook.contribute())
    .slice()
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.label.localeCompare(right.label)), [revision]);

  const panels = useMemo(() => platform.capabilities
    .getAll<WorkbenchPanelHook>("workbench.panel.hook")
    .flatMap((hook) => hook.contribute())
    .flatMap(expandWorkbenchPanelContribution)
    .slice()
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.label.localeCompare(right.label)), [revision]);

  const toolWindows = useMemo(() => platform.capabilities
    .getAll<WorkbenchToolWindowHook>("workbench.toolWindow.hook")
    .flatMap((hook) => hook.contribute())
    .flatMap(expandWorkbenchToolWindowContribution)
    .slice()
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.label.localeCompare(right.label)), [revision]);

  const activityButtons = useMemo<readonly PluginActivityButton[]>(() => [
    ...sidebars.map((sidebar, index) => ({
      key: `sidebar:${sidebar.id}`,
      id: sidebar.id,
      kind: "sidebar" as const,
      label: sidebar.label,
      ...(sidebar.icon ? { icon: sidebar.icon } : {}),
      ...(sidebar.activityBadge ? { activityBadge: sidebar.activityBadge } : {}),
      defaultOrder: 100 + (sidebar.order ?? index),
      defaultSide: "left" as const,
      movable: true,
    })),
    ...toolWindows.map((toolWindow, index) => ({
      key: `toolWindow:${toolWindow.id}`,
      id: toolWindow.id,
      kind: "toolWindow" as const,
      label: toolWindow.label,
      ...(toolWindow.icon ? { icon: toolWindow.icon } : {}),
      ...(toolWindow.activityBadge ? { activityBadge: toolWindow.activityBadge } : {}),
      defaultOrder: 12_000 + (toolWindow.order ?? index),
      defaultSide: "left" as const,
      movable: true,
    })),
  ], [sidebars, toolWindows]);

  const titlebar = useMemo(() => platform.capabilities
    .getAll<WorkbenchTitlebarContribution>("workbench.titlebar")
    .slice()
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.id.localeCompare(right.id)), [revision]);

  const statusbar = useMemo(() => platform.capabilities
    .getAll<WorkbenchStatusbarContribution>("workbench.statusbar")
    .slice()
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0) || left.id.localeCompare(right.id)), [revision]);

  const explorerFilter = useMemo(() => platform.capabilities
    .getAll<WorkbenchExplorerFilterProvider>("workbench.explorerFilter")
    .slice()
    .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0) || left.id.localeCompare(right.id))
    .at(0), [revision]);

  return {
    sidebars,
    panels,
    toolWindows,
    activityButtons,
    titlebar,
    statusbar,
    explorerFilter,
  };
}
