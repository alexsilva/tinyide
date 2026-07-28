import type {
  ExecutionProfileStep,
  ExecutionProfileTargetKindOption,
} from "@tinyide/plugin-api";

export const GENERIC_EXECUTION_TARGET = "";

export function executionTargetKindKey(
  targetKind: Pick<ExecutionProfileTargetKindOption, "providerId" | "id">,
): string {
  return `${targetKind.providerId}:${targetKind.id}`;
}

export function executionStepArguments(step: ExecutionProfileStep): readonly string[] {
  if (step.arguments) return step.arguments;
  return [
    ...(step.command.trim() ? [step.command.trim()] : []),
    ...step.parameters,
  ];
}

export function executionTargetKindForStep(
  step: ExecutionProfileStep,
  targetKinds: readonly ExecutionProfileTargetKindOption[],
): ExecutionProfileTargetKindOption | undefined {
  if (!step.target) return undefined;
  return targetKinds.find((targetKind) => (
    targetKind.providerId === step.target?.providerId
    && targetKind.id === step.target.kindId
  ));
}

export function selectExecutionTargetKind(
  step: ExecutionProfileStep,
  targetKind: ExecutionProfileTargetKindOption,
): ExecutionProfileStep {
  const parsed = targetKind.parseArguments?.(executionStepArguments(step));
  const value = parsed?.target ?? step.target?.value ?? step.command.trim();
  const parameters = parsed ? [...parsed.parameters] : [...step.parameters];
  return {
    ...step,
    command: "",
    parameters,
    arguments: [...targetKind.buildArguments(value, parameters)],
    target: {
      providerId: targetKind.providerId,
      kindId: targetKind.id,
      value,
    },
  };
}

export function updateExecutionTargetValue(
  step: ExecutionProfileStep,
  targetKind: ExecutionProfileTargetKindOption,
  value: string,
): ExecutionProfileStep {
  return {
    ...step,
    arguments: [...targetKind.buildArguments(value, step.parameters)],
    target: {
      providerId: targetKind.providerId,
      kindId: targetKind.id,
      value,
    },
  };
}

export function materializeExecutionTarget(
  step: ExecutionProfileStep,
  targetKind: ExecutionProfileTargetKindOption,
  parameters: readonly string[],
): ExecutionProfileStep {
  const value = step.target?.value.trim() ?? "";
  if (!value) throw new Error(`${targetKind.valueLabel} é obrigatório.`);
  return {
    ...step,
    command: "",
    parameters: [...parameters],
    arguments: [...targetKind.buildArguments(value, parameters)],
    target: {
      providerId: targetKind.providerId,
      kindId: targetKind.id,
      value,
    },
  };
}

export function clearExecutionTarget(step: ExecutionProfileStep): ExecutionProfileStep {
  const argumentsList = executionStepArguments(step);
  const {
    arguments: _materializedArguments,
    target: _target,
    ...genericStep
  } = step;
  return {
    ...genericStep,
    command: argumentsList[0] ?? "",
    parameters: argumentsList.slice(1),
  };
}
