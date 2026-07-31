import { describe, expect, it } from "vitest";
import { projectSessionInternals } from "./project-session";

describe("project session", () => {
  it("accepts only bounded header-safe identifiers", () => {
    expect(projectSessionInternals.validSessionId("2bca0f19-7b20-443a-b268-a70d9c4ccb74")).toBe(true);
    expect(projectSessionInternals.validSessionId("project.session_1")).toBe(true);
    expect(projectSessionInternals.validSessionId("../project")).toBe(false);
    expect(projectSessionInternals.validSessionId("with space")).toBe(false);
    expect(projectSessionInternals.validSessionId("x".repeat(129))).toBe(false);
  });
});
