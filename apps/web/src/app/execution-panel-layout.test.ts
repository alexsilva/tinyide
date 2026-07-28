import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const workbenchStyles = readFileSync(new URL("../styles/workbench.css", import.meta.url), "utf8");
const featureStyles = readFileSync(new URL("../styles/features.css", import.meta.url), "utf8");

describe("execution panel layout", () => {
  it("keeps run and debug output in the horizontal bottom region", () => {
    expect(appSource).toContain('<div className="workbench-bottom-region">');
    expect(appSource).toContain('className="resize-handle resize-handle--panel"');
    expect(appSource).not.toContain("executionDockSide");
    expect(appSource).not.toContain("output-panel--side");
    expect(workbenchStyles).not.toContain("workbench-bottom-region--side");
    expect(workbenchStyles).not.toContain("output-panel--side");
  });

  it("reveals the execution panel through the single helper that hides the tool window", () => {
    const helper = appSource.slice(
      appSource.indexOf("const revealExecutionPanel = useCallback("),
      appSource.indexOf("}, []);", appSource.indexOf("const revealExecutionPanel = useCallback(")),
    );
    expect(helper).toContain("setToolWindowVisible(false)");
    expect(helper).toContain("setPanelVisible(true)");

    // Todo caminho que mostra o painel inferior (run, debug, restart, restauração,
    // toggle) precisa passar pelo helper, senão dois painéis horizontais empilham.
    const reveals = appSource.match(/revealExecutionPanel\(/g) ?? [];
    expect(reveals.length).toBeGreaterThanOrEqual(6);
    const openers = appSource.match(/setPanelVisible\(true\)/g) ?? [];
    expect(openers).toHaveLength(1);
  });

  it("keeps follow output in the existing execution toolbar without an extra row", () => {
    expect(appSource).toContain('className="workbench-output-follow execution-panel-toolbar__follow"');
    expect(appSource).not.toContain('className="execution-text-output__toolbar"');
    expect(featureStyles).not.toContain(".execution-text-output__toolbar");
  });
});
