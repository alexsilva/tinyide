import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const workbenchStyles = readFileSync(new URL("../styles/workbench.css", import.meta.url), "utf8");

describe("execution panel layout", () => {
  it("keeps run and debug output in the horizontal bottom region", () => {
    expect(appSource).toContain('<div className="workbench-bottom-region">');
    expect(appSource).toContain('className="resize-handle resize-handle--panel"');
    expect(appSource).not.toContain("executionDockSide");
    expect(appSource).not.toContain("output-panel--side");
    expect(workbenchStyles).not.toContain("workbench-bottom-region--side");
    expect(workbenchStyles).not.toContain("output-panel--side");
  });
});
