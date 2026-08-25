import type {
  DebugSessionSnapshot,
  ExecutionEnvironment,
  ExecutionProfile,
  WorkbenchExecutionSnapshot,
} from "@tinyide/plugin-api";
import type { ProfileExecutionState } from "../profile-execution-state";

export interface ExecutionSnapshotDebugRecord {
  readonly session: DebugSessionSnapshot;
}

export interface ExecutionSnapshotInput {
  readonly profiles: readonly ExecutionProfile[];
  readonly selectedProfileId?: string;
  readonly environments: readonly ExecutionEnvironment[];
  readonly selectedEnvironmentId?: string;
  readonly selectedEnvironmentIds?: Readonly<Record<string, string>>;
  readonly executions: Readonly<Record<string, ProfileExecutionState>>;
  readonly debugSessions: Readonly<Record<string, ExecutionSnapshotDebugRecord>>;
}

function cloneProfile(profile: ExecutionProfile): ExecutionProfile {
  return {
    ...profile,
    environment: { ...profile.environment },
    steps: profile.steps.map((step) => ({
      ...step,
      ...(step.arguments ? { arguments: [...step.arguments] } : {}),
      parameters: [...step.parameters],
      ...(step.target ? { target: { ...step.target } } : {}),
      ...(step.environmentVariables ? { environmentVariables: { ...step.environmentVariables } } : {}),
    })),
  };
}

export function createWorkbenchExecutionSnapshot(input: ExecutionSnapshotInput): WorkbenchExecutionSnapshot {
  const activeDebugSessions = Object.values(input.debugSessions)
    .map((record) => record.session)
    .sort((left, right) => left.startedAt - right.startedAt);
  const selectedDebugSession = input.selectedProfileId
    ? input.debugSessions[input.selectedProfileId]?.session
    : undefined;
  const focusedDebugSession = selectedDebugSession ?? activeDebugSessions.at(-1);

  return {
    profiles: input.profiles.map(cloneProfile),
    ...(input.selectedProfileId ? { selectedProfileId: input.selectedProfileId } : {}),
    environments: input.environments.map((environment) => ({ ...environment })),
    ...(input.selectedEnvironmentId ? { selectedEnvironmentId: input.selectedEnvironmentId } : {}),
    ...(input.selectedEnvironmentIds && Object.keys(input.selectedEnvironmentIds).length
      ? { selectedEnvironmentIds: { ...input.selectedEnvironmentIds } }
      : {}),
    executions: Object.values(input.executions).map((execution) => ({
      ...execution,
      ...(execution.profile ? { profile: cloneProfile(execution.profile) } : {}),
      output: [...execution.output],
      ...(execution.data ? { data: { ...execution.data } } : {}),
    })),
    ...(activeDebugSessions.length ? { debugSessions: activeDebugSessions } : {}),
    ...(focusedDebugSession ? { debugSession: focusedDebugSession } : {}),
  };
}
