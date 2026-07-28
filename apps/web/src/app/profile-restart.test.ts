import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

describe("profile execution restart", () => {
  it("waits for the active run to finish before replacing it without the stale running-state guard", () => {
    const restart = appSource.slice(
      appSource.indexOf("const restartProfileExecution = async"),
      appSource.indexOf("const closeProfileOutputTab", appSource.indexOf("const restartProfileExecution = async")),
    );

    expect(restart).toContain("await stopProfileExecution(profile.id)");
    expect(restart).toContain("await existingRun.catch(() => undefined)");
    expect(restart).toContain("restartedRun = runProfile(profile, true)");
  });
});
