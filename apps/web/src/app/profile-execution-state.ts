import { hostProcessOutputLines, type HostProcessSnapshot } from "./runtime";

export type ProfileExecutionStatus = "running" | "completed" | "failed" | "stopped";

export interface ProfileExecutionState {
  readonly profileId: string;
  readonly profileName: string;
  readonly status: ProfileExecutionStatus;
  readonly output: readonly string[];
  readonly processId?: string;
  readonly error?: string;
  readonly startedAt?: number;
  readonly finishedAt?: number;
}

export interface ResumedProfileProcess {
  readonly profileId: string;
  readonly processId: string;
  readonly precedingOutput: readonly string[];
}

export interface RestoredProfileExecutions {
  readonly states: Readonly<Record<string, ProfileExecutionState>>;
  readonly running: readonly ResumedProfileProcess[];
}

const PROFILE_EXECUTION_PANEL_TAB_PREFIX = "execution-profile:";

export type ProfileExecutionTabMode = "run" | "debug";

export interface ProfileExecutionPanelTab {
  readonly profileId: string;
  readonly mode: ProfileExecutionTabMode;
}

export function profileExecutionPanelTabId(
  profileId: string,
  mode: ProfileExecutionTabMode = "run",
): string {
  return `${PROFILE_EXECUTION_PANEL_TAB_PREFIX}${mode}:${encodeURIComponent(profileId)}`;
}

export function profileExecutionPanelTab(tabId: string): ProfileExecutionPanelTab | undefined {
  if (!tabId.startsWith(PROFILE_EXECUTION_PANEL_TAB_PREFIX)) return undefined;
  const encoded = tabId.slice(PROFILE_EXECUTION_PANEL_TAB_PREFIX.length);
  const separator = encoded.indexOf(":");
  if (separator <= 0) return undefined;
  const mode = encoded.slice(0, separator);
  if (mode !== "run" && mode !== "debug") return undefined;
  const encodedProfileId = encoded.slice(separator + 1);
  if (!encodedProfileId) return undefined;
  try {
    return { profileId: decodeURIComponent(encodedProfileId), mode };
  } catch {
    return undefined;
  }
}

export function profileIdFromExecutionPanelTab(tabId: string): string | undefined {
  return profileExecutionPanelTab(tabId)?.profileId;
}

export function openProfileExecutionTab(
  currentTabIds: readonly string[],
  profileId: string,
  mode: ProfileExecutionTabMode = "run",
): readonly string[] {
  const tabId = profileExecutionPanelTabId(profileId, mode);
  return currentTabIds.includes(tabId)
    ? currentTabIds
    : [...currentTabIds, tabId];
}

export function restoredProfileExecutionTabIds(
  states: Readonly<Record<string, ProfileExecutionState>>,
): readonly string[] {
  return Object.values(states)
    .filter((state) => state.status === "running")
    .slice()
    .sort((left, right) => (left.startedAt ?? 0) - (right.startedAt ?? 0) || left.profileName.localeCompare(right.profileName))
    .map((state) => profileExecutionPanelTabId(state.profileId, "run"));
}

export function nextPanelTabAfterClosingProfile(
  currentTabIds: readonly string[],
  tabId: string,
  fallbackTabId = "output",
): string {
  const closedIndex = currentTabIds.indexOf(tabId);
  const remaining = currentTabIds.filter((candidate) => candidate !== tabId);
  if (!remaining.length) return fallbackTabId;
  return remaining[Math.min(Math.max(closedIndex, 0), remaining.length - 1)] ?? remaining.at(-1) ?? fallbackTabId;
}

function linesForProfileProcess(
  process: HostProcessSnapshot,
): readonly string[] {
  return hostProcessOutputLines(process);
}

function statusForProcess(process: HostProcessSnapshot): ProfileExecutionStatus {
  if (process.status === "running") return "running";
  if (process.stopRequested) return "stopped";
  return process.exitCode === 0 ? "completed" : "failed";
}

export function profileExecutionStatusLabel(state: ProfileExecutionState | undefined): string {
  if (!state) return "Não executado";
  if (state.status === "running") return "Executando";
  if (state.status === "completed") return "Concluído";
  if (state.status === "stopped") return "Interrompido";
  return "Falhou";
}

export function profileExecutionOutput(state: ProfileExecutionState | undefined): readonly string[] {
  return state?.output.length ? state.output : ["[não executado]"];
}

export function resumedProfileProcessOutput(
  resumed: ResumedProfileProcess,
  process: HostProcessSnapshot,
): readonly string[] {
  return [
    ...resumed.precedingOutput,
    ...linesForProfileProcess(process),
  ];
}

export function restoreProfileExecutions(
  processes: readonly HostProcessSnapshot[],
): RestoredProfileExecutions {
  const grouped = new Map<string, HostProcessSnapshot[]>();
  for (const process of processes) {
    const presentation = process.presentation;
    if (presentation?.kind !== "profile") continue;
    const current = grouped.get(presentation.sourceId) ?? [];
    current.push(process);
    grouped.set(presentation.sourceId, current);
  }

  const states: Record<string, ProfileExecutionState> = {};
  const running: ResumedProfileProcess[] = [];
  for (const [profileId, profileProcesses] of grouped) {
    const newestProcess = profileProcesses.reduce((latest, process) => (
      process.startedAt > latest.startedAt ? process : latest
    ));
    const newestRunId = newestProcess.presentation?.runId;
    const currentRun = newestRunId
      ? profileProcesses.filter((process) => process.presentation?.runId === newestRunId)
      : [newestProcess];
    const ordered = currentRun.slice().sort((left, right) => left.startedAt - right.startedAt);
    const latest = ordered.at(-1)!;
    const output: string[] = [];
    for (const process of ordered) {
      output.push(...linesForProfileProcess(process));
    }
    states[profileId] = {
      profileId,
      profileName: latest.presentation!.sourceName,
      status: statusForProcess(latest),
      output,
      ...(latest.status === "running" ? { processId: latest.id } : {}),
      startedAt: ordered[0]!.startedAt,
      ...(latest.finishedAt ? { finishedAt: latest.finishedAt } : {}),
      ...(latest.status !== "running" && latest.exitCode !== 0 && !latest.stopRequested
        ? { error: `Processo encerrado com código ${latest.exitCode ?? -1}.` }
        : {}),
    };
    if (latest.status === "running") {
      const precedingOutput: string[] = [];
      for (const process of ordered.slice(0, -1)) {
        precedingOutput.push(...linesForProfileProcess(process));
      }
      running.push({ profileId, processId: latest.id, precedingOutput });
    }
  }
  return { states, running };
}
