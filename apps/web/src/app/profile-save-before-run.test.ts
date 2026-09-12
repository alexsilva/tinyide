import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

describe("save before run", () => {
  it("treats a missing saveBeforeRun flag as enabled, matching the dialog checkbox", () => {
    const helper = appSource.slice(
      appSource.indexOf("const saveDocumentsBeforeRun = async"),
      appSource.indexOf("const startDebugForProfile"),
    );

    expect(helper).toContain("if (profile.saveBeforeRun === false) return;");
    expect(helper).not.toContain("profile.saveBeforeRun &&");
  });

  it("saves every dirty document that has a file, not only the active one", () => {
    const helper = appSource.slice(
      appSource.indexOf("const saveDocumentsBeforeRun = async"),
      appSource.indexOf("const startDebugForProfile"),
    );

    expect(helper).toContain("for (const document of documentsRef.current)");
    expect(helper).toContain("document.kind !== \"text\" || document.readOnly || !document.handle");
    expect(helper).toContain("await saveOpenDocument(document);");
  });

  it("runs the save step when executing, debugging and restarting a debug session", () => {
    expect(appSource.match(/await saveDocumentsBeforeRun\(profile\);/g)).toHaveLength(3);
  });
});
