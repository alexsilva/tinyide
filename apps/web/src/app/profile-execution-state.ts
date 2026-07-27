import type { ExecutionProfile } from "@tinyide/plugin-api";
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

export function profileExecutionPanelTabId(profileId: string): string {
  return `${PROFILE_EXECUTION_PANEL_TAB_PREFIX}${encodeURIComponent(profileId)}`;
}

export function profileIdFromExecutionPanelTab(tabId: string): string | undefined {
  if (!tabId.startsWith(PROFILE_EXECUTION_PANEL_TAB_PREFIX)) return undefined;
  const encodedProfileId = tabId.slice(PROFILE_EXECUTION_PANEL_TAB_PREFIX.length);
  if (!encodedProfileId) return undefined;
  try {
    return decodeURIComponent(encodedProfileId);
  } catch {
    return undefined;
  }
}

export function openProfileExecutionTab(
  currentProfileIds: readonly string[],
  profileId: string,
): readonly string[] {
  return currentProfileIds.includes(profileId)
    ? currentProfileIds
    : [...currentProfileIds, profileId];
}

export function restoredProfileExecutionTabIds(
  states: Readonly<Record<string, ProfileExecutionState>>,
): readonly string[] {
  return Object.values(states)
    .filter((state) => state.status === "running")
    .slice()
    .sort((left, right) => (left.startedAt ?? 0) - (right.startedAt ?? 0) || left.profileName.localeCompare(right.profileName))
    .map((state) => state.profileId);
}

export function nextPanelTabAfterClosingProfile(
  currentProfileIds: readonly string[],
  profileId: string,
  fallbackTabId = "output",
): string {
  const closedIndex = currentProfileIds.indexOf(profileId);
  const remaining = currentProfileIds.filter((candidate) => candidate !== profileId);
  if (!remaining.length) return fallbackTabId;
  const nextProfileId = remaining[Math.min(Math.max(closedIndex, 0), remaining.length - 1)] ?? remaining.at(-1);
  return nextProfileId ? profileExecutionPanelTabId(nextProfileId) : fallbackTabId;
}

function linesForProfileProcess(
  process: HostProcessSnapshot,
  includeProfileHeading: boolean,
): readonly string[] {
  const lines = hostProcessOutputLines(process);
  return includeProfileHeading ? lines : lines.slice(1);
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

export function profileExecutionOutput(
  profile: Pick<ExecutionProfile, "name">,
  state: ProfileExecutionState | undefined,
): readonly string[] {
  return state?.output.length
    ? state.output
    : [`[perfil] ${profile.name}`, "[não executado]"];
}

export function resumedProfileProcessOutput(
  resumed: ResumedProfileProcess,
  process: HostProcessSnapshot,
): readonly string[] {
  return [
    ...resumed.precedingOutput,
    ...linesForProfileProcess(process, resumed.precedingOutput.length === 0),
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
      output.push(...linesForProfileProcess(process, output.length === 0));
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
        precedingOutput.push(...linesForProfileProcess(process, precedingOutput.length === 0));
      }
      running.push({ profileId, processId: latest.id, precedingOutput });
    }
  }
  return { states, running };
}
