import { describe, expect, it } from "vitest";
import {
  appendExecutionOutput,
  EXECUTION_OUTPUT_TRUNCATED_MARKER,
  executionOutputText,
} from "./execution-output-buffer";

describe("execution output buffer", () => {
  it("appends stream chunks without growing beyond the configured budget", () => {
    let output: readonly string[] = [];
    for (let index = 0; index < 200; index += 1) {
      output = appendExecutionOutput(output, [`line-${index.toString().padStart(3, "0")} ${"x".repeat(40)}\n`], {
        maxChars: 1024,
      });
    }
    const text = executionOutputText(output);
    expect(text.length).toBeLessThanOrEqual(1024);
    expect(text).toContain(EXECUTION_OUTPUT_TRUNCATED_MARKER);
    expect(text).toContain("line-199");
    expect(text).not.toContain("line-000");
  });

  it("marks gaps reported by the backend cursor", () => {
    const output = appendExecutionOutput(["before"], ["after"], { truncated: true, maxChars: 2048 });
    expect(output).toEqual(["before", EXECUTION_OUTPUT_TRUNCATED_MARKER, "after"]);
  });
});
