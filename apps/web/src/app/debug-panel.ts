import type { DebugSessionSnapshot, DebugVariable } from "@tinyide/plugin-api";

export type DebugOutputFilter = "all" | "stdout" | "stderr" | "system";

export interface DebugPanelLayoutSettings {
  readonly inspectorWidth?: number;
  readonly outputWrap?: boolean;
  readonly outputFollowTail?: boolean;
}

export interface DebugOutputOffsets {
  readonly stdout: number;
  readonly stderr: number;
  readonly error: number;
}

export interface DebugOutputSegment {
  readonly kind: Exclude<DebugOutputFilter, "all">;
  readonly label: string;
  readonly text: string;
}

export const DEFAULT_DEBUG_PANEL_LAYOUT = Object.freeze({
  inspectorWidth: 360,
  outputWrap: false,
  outputFollowTail: true,
});

export const EMPTY_DEBUG_OUTPUT_OFFSETS: DebugOutputOffsets = Object.freeze({
  stdout: 0,
  stderr: 0,
  error: 0,
});

export function clampDebugInspectorWidth(containerWidth: number, desiredWidth: number): number {
  const maximum = Math.max(260, containerWidth - 320);
  return Math.round(Math.min(maximum, Math.max(260, desiredWidth)));
}

export function normalizeDebugPanelLayout(layout?: DebugPanelLayoutSettings) {
  return {
    inspectorWidth: Number.isFinite(layout?.inspectorWidth)
      ? Math.max(260, Number(layout?.inspectorWidth))
      : DEFAULT_DEBUG_PANEL_LAYOUT.inspectorWidth,
    outputWrap: layout?.outputWrap ?? DEFAULT_DEBUG_PANEL_LAYOUT.outputWrap,
    outputFollowTail: layout?.outputFollowTail ?? DEFAULT_DEBUG_PANEL_LAYOUT.outputFollowTail,
  };
}

export function debugOutputOffsetsFor(session: Pick<DebugSessionSnapshot, "stdout" | "stderr" | "error">): DebugOutputOffsets {
  return {
    stdout: session.stdout.length,
    stderr: session.stderr.length,
    error: session.error?.length ?? 0,
  };
}

export function debugOutputSegments(
  session: Pick<DebugSessionSnapshot, "stdout" | "stderr" | "error">,
  offsets: DebugOutputOffsets,
  filter: DebugOutputFilter,
): readonly DebugOutputSegment[] {
  const candidates: readonly DebugOutputSegment[] = [
    { kind: "stdout", label: "stdout", text: session.stdout.slice(offsets.stdout) },
    { kind: "stderr", label: "stderr", text: session.stderr.slice(offsets.stderr) },
    { kind: "system", label: "debugger", text: (session.error ?? "").slice(offsets.error) },
  ];
  return candidates.filter((segment) => segment.text && (filter === "all" || filter === segment.kind));
}

function variableMatches(variable: DebugVariable, normalizedQuery: string): boolean {
  return `${variable.name}\n${variable.type ?? ""}\n${variable.value}`.toLocaleLowerCase().includes(normalizedQuery);
}

export function filterDebugVariables(
  variables: readonly DebugVariable[],
  query: string,
): readonly DebugVariable[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return variables;
  return variables.flatMap((variable) => {
    const children = variable.children ? filterDebugVariables(variable.children, normalizedQuery) : [];
    if (!variableMatches(variable, normalizedQuery) && !children.length) return [];
    return [{
      ...variable,
      ...(variable.children ? { children } : {}),
    }];
  });
}
