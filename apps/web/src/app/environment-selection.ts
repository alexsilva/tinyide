import type { ExecutionEnvironment } from "@tinyide/plugin-api";

export type EnvironmentSelections = Readonly<Record<string, string>>;

function environmentForId(
  environments: readonly ExecutionEnvironment[],
  environmentId: string | undefined,
): ExecutionEnvironment | undefined {
  if (!environmentId) return undefined;
  return environments.find((environment) => environment.id === environmentId);
}

export function resolveEnvironmentSelections(
  environments: readonly ExecutionEnvironment[],
  configured: EnvironmentSelections = {},
  options: {
    readonly preferredId?: string;
    readonly legacySelectedId?: string;
  } = {},
): EnvironmentSelections {
  const selected: Record<string, string> = {};
  const preferred = environmentForId(environments, options.preferredId);
  const legacy = environmentForId(environments, options.legacySelectedId);
  const providerIds = [...new Set(environments.flatMap((environment) => (
    environment.providerId ? [environment.providerId] : []
  )))];

  for (const providerId of providerIds) {
    const providerEnvironments = environments.filter((environment) => environment.providerId === providerId);
    const configuredId = configured[providerId];
    const configuredEnvironment = environmentForId(providerEnvironments, configuredId);
    const preferredEnvironment = preferred?.providerId === providerId ? preferred : undefined;
    const legacyEnvironment = legacy?.providerId === providerId ? legacy : undefined;
    const fallback = providerEnvironments.find((environment) => environment.status === "ready")
      ?? providerEnvironments[0];
    const choice = preferredEnvironment ?? configuredEnvironment ?? legacyEnvironment ?? fallback;
    if (choice) selected[providerId] = choice.id;
  }

  return selected;
}

export function environmentSelectionsEqual(
  left: EnvironmentSelections | undefined,
  right: EnvironmentSelections | undefined,
): boolean {
  const leftEntries = Object.entries(left ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const rightEntries = Object.entries(right ?? {}).sort(([a], [b]) => a.localeCompare(b));
  return leftEntries.length === rightEntries.length
    && leftEntries.every(([providerId, environmentId], index) => (
      rightEntries[index]?.[0] === providerId && rightEntries[index]?.[1] === environmentId
    ));
}

export function selectedEnvironmentForProvider(
  environments: readonly ExecutionEnvironment[],
  selections: EnvironmentSelections,
  providerId: string | undefined,
): ExecutionEnvironment | undefined {
  if (!providerId) return undefined;
  const environmentId = selections[providerId];
  return environments.find((environment) => (
    environment.id === environmentId && environment.providerId === providerId
  ));
}
