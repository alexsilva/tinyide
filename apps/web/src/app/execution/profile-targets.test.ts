import { describe, expect, it } from "vitest";
import type {
  ExecutionProfileStep,
  ExecutionProfileTargetKindOption,
} from "@tinyide/plugin-api";
import {
  clearExecutionTarget,
  materializeExecutionTarget,
  selectExecutionTargetKind,
  updateExecutionTargetValue,
} from "./profile-targets";

const moduleTarget: ExecutionProfileTargetKindOption = {
  id: "module",
  providerId: "runtime",
  providerName: "Runtime",
  label: "Módulo",
  valueLabel: "Nome do módulo",
  buildArguments: (target, parameters) => ["-m", target, ...parameters],
  parseArguments: (argumentsList) => argumentsList[0] === "-m" && argumentsList[1]
    ? { target: argumentsList[1], parameters: argumentsList.slice(2) }
    : undefined,
};

const step: ExecutionProfileStep = {
  id: "run",
  name: "Executar",
  executable: "python",
  command: "-m",
  parameters: ["celery", "-A", "config"],
};

describe("execution profile target authoring", () => {
  it("lets a provider parse a legacy argument sequence", () => {
    const selected = selectExecutionTargetKind(step, moduleTarget);
    expect(selected.target).toEqual({ providerId: "runtime", kindId: "module", value: "celery" });
    expect(selected.parameters).toEqual(["-A", "config"]);
    expect(selected.arguments).toEqual(["-m", "celery", "-A", "config"]);
  });

  it("updates and materializes provider-owned targets", () => {
    const selected = selectExecutionTargetKind(step, moduleTarget);
    const updated = updateExecutionTargetValue(selected, moduleTarget, "worker");
    expect(updated.arguments).toEqual(["-m", "worker", "-A", "config"]);
    expect(materializeExecutionTarget(updated, moduleTarget, ["--loglevel=INFO"]).arguments)
      .toEqual(["-m", "worker", "--loglevel=INFO"]);
  });

  it("falls back to the generic command representation without runtime knowledge", () => {
    const selected = selectExecutionTargetKind(step, moduleTarget);
    const generic = clearExecutionTarget(selected);
    expect(generic.target).toBeUndefined();
    expect(generic.arguments).toBeUndefined();
    expect(generic.command).toBe("-m");
    expect(generic.parameters).toEqual(["celery", "-A", "config"]);
  });
});
