import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const pluginHostsSource = readFileSync(new URL("./workbench-plugin-hosts.tsx", import.meta.url), "utf8");
const activityBarSource = readFileSync(new URL("./workbench/WorkbenchActivityBar.tsx", import.meta.url), "utf8");
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

  it("lets a plugin own the run tab body without duplicating the follow control", () => {
    // A aba de execução é compartilhada por todos os perfis; um plugin (pytest)
    // substitui apenas o corpo da aba de execução do seu próprio perfil.
    expect(appSource).toContain("viewProvider: tabDebugSession ? undefined : executionViewProviderFor(viewTarget)");
    expect(appSource).toContain("<ExecutionViewHost");
    expect(appSource).toContain("{!tabDebugSession && !tab.viewProvider ? (");
  });

  it("keeps follow output in the existing execution toolbar without an extra row", () => {
    expect(appSource).toContain('className="workbench-output-follow execution-panel-toolbar__follow"');
    expect(appSource).not.toContain('className="execution-text-output__toolbar"');
    expect(featureStyles).not.toContain(".execution-text-output__toolbar");
  });

  it("keeps tool windows visible until the panel X is used", () => {
    const toggle = appSource.slice(
      appSource.indexOf("const toggleToolWindow = (toolWindowId: string) => {"),
      appSource.indexOf("const togglePluginSidebar = (sidebarId: string) => {"),
    );
    expect(toggle).toContain("if (!toolWindowVisible)");
    expect(toggle).not.toContain("const next = !visible");
    expect(toggle).not.toContain("return next");
    expect(appSource).toContain("onClose={closeToolWindow}");
    expect(pluginHostsSource).toContain('aria-label={`Ocultar painel ${provider.label}`}');
    expect(pluginHostsSource).toContain('title="Ocultar painel"');
    expect(activityBarSource).toContain('const disabled = pluginItem.kind === "toolWindow" && active;');
    expect(activityBarSource).toContain('disabled={disabled}');
    expect(activityBarSource).toContain('`Exibir ${pluginItem.label}`');
  });
});
