import type { ActivityBarSide } from "./activity-layout";

export interface ToolWindowLayoutState {
  readonly activeToolWindowId?: string;
  readonly toolWindowVisible: boolean;
}

export type SidebarViewsBySide = Partial<Record<ActivityBarSide, string>>;

export type VerticalPanelWidths = Readonly<Record<ActivityBarSide, number>>;

export function updateVerticalPanelWidth(
  current: VerticalPanelWidths,
  side: ActivityBarSide,
  width: number,
): VerticalPanelWidths {
  return current[side] === width ? current : { ...current, [side]: width };
}

export function sidebarActivityKey(viewId: string): string {
  if (viewId === "explorer" || viewId === "plugins" || viewId === "environments") {
    return `builtin:${viewId}`;
  }
  return `sidebar:${viewId}`;
}

export function sidebarViewFromActivityKey(key: string): string | undefined {
  if (key === "builtin:explorer") return "explorer";
  if (key === "builtin:plugins") return "plugins";
  if (key === "builtin:environments") return "environments";
  return key.startsWith("sidebar:") ? key.slice("sidebar:".length) : undefined;
}

export function openSidebarViewForSide(
  current: SidebarViewsBySide,
  side: ActivityBarSide,
  viewId: string,
): SidebarViewsBySide {
  const other: ActivityBarSide = side === "left" ? "right" : "left";
  if (current[side] === viewId && current[other] !== viewId) return current;
  const next = { ...current, [side]: viewId };
  if (next[other] === viewId) delete next[other];
  return next;
}

export function toggleSidebarViewForSide(
  current: SidebarViewsBySide,
  side: ActivityBarSide,
  viewId: string,
): SidebarViewsBySide {
  if (current[side] === viewId) {
    const next = { ...current };
    delete next[side];
    return next;
  }
  return openSidebarViewForSide(current, side, viewId);
}

export function closeSidebarForSide(
  current: SidebarViewsBySide,
  side: ActivityBarSide,
): SidebarViewsBySide {
  if (!current[side]) return current;
  const next = { ...current };
  delete next[side];
  return next;
}

export function moveOpenSidebar(
  current: SidebarViewsBySide,
  viewId: string,
  from: ActivityBarSide,
  to: ActivityBarSide,
): SidebarViewsBySide {
  if (current[from] !== viewId) return current;
  const next = { ...current, [to]: viewId };
  if (from !== to) delete next[from];
  return next;
}

const SIDEBAR_MIN_WIDTH = 180;
const SIDEBAR_MAX_WIDTH = 720;
const ENVIRONMENT_SIDEBAR_MAX_WIDTH = 520;

export function maximumSidebarWidth(viewId: string): number {
  return viewId === "environments"
    ? ENVIRONMENT_SIDEBAR_MAX_WIDTH
    : SIDEBAR_MAX_WIDTH;
}

export function sidebarWidthForView(width: number, viewId: string): number {
  return Math.min(
    maximumSidebarWidth(viewId),
    Math.max(SIDEBAR_MIN_WIDTH, width),
  );
}

/**
 * Tool windows já ativados permanecem montados (apenas ocultos) para preservar
 * estado vivo — um terminal com TUI não sobrevive a desmontar/remontar, porque a
 * reconexão reproduz o histórico cru do PTY. Remove apenas ids desinstalados.
 */
export function retainMountedToolWindows(
  previous: ReadonlySet<string>,
  input: {
    readonly activeToolWindowId?: string;
    readonly toolWindowVisible: boolean;
    readonly availableIds: readonly string[];
  },
): ReadonlySet<string> {
  const available = new Set(input.availableIds);
  const next = new Set([...previous].filter((id) => available.has(id)));
  if (input.toolWindowVisible && input.activeToolWindowId && available.has(input.activeToolWindowId)) {
    next.add(input.activeToolWindowId);
  }
  if (next.size === previous.size && [...next].every((id) => previous.has(id))) return previous;
  return next;
}

export function reconcileToolWindowLayout(input: {
  readonly initialized: boolean;
  readonly availableIds: readonly string[];
  readonly current: ToolWindowLayoutState;
}): ToolWindowLayoutState {
  const { initialized, availableIds, current } = input;
  if (!initialized) return current;
  const firstAvailableId = availableIds[0];
  if (!firstAvailableId) return { toolWindowVisible: false };
  if (current.activeToolWindowId && availableIds.includes(current.activeToolWindowId)) {
    return current;
  }
  return {
    activeToolWindowId: firstAvailableId,
    toolWindowVisible: current.toolWindowVisible,
  };
}
