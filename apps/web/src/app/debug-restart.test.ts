import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

describe("debug execution toolbar", () => {
  it("offers restart in the local debug toolbar", () => {
    expect(appSource).toContain('aria-label="Reiniciar depuração"');
    expect(appSource).toContain("restartDebugSession(tab.profileId)");
  });

  it("does not let polling from an old session replace the restarted session", () => {
    expect(appSource).toContain("current?.id === snapshot.id ? snapshot : current");
  });
});
