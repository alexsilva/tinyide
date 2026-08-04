import type { ModuleContext, TinyIdeModule } from "@tinyide/plugin-api";
import { describe, expect, it, vi } from "vitest";
import { AppModuleHost } from "./module-host";

function context(): ModuleContext {
  return {
    commands: {} as ModuleContext["commands"],
    events: {} as ModuleContext["events"],
    extensions: {} as ModuleContext["extensions"],
    workbench: {} as ModuleContext["workbench"],
    subscriptions: [],
  };
}

describe("module host", () => {
  it("initializes modules automatically and disposes subscriptions in reverse order", async () => {
    const disposed: string[] = [];
    const module: TinyIdeModule = {
      id: "html",
      version: "0.1.0",
      init(moduleContext) {
        moduleContext.subscriptions.push(
          { dispose: () => disposed.push("first") },
          { dispose: () => disposed.push("second") },
        );
      },
      dispose: vi.fn(),
    };
    const host = new AppModuleHost(() => context());

    await host.initialize([module]);
    expect(host.list()).toEqual([module]);
    await host.disposeAsync();

    expect(module.dispose).toHaveBeenCalledOnce();
    expect(disposed).toEqual(["second", "first"]);
  });

  it("rejects duplicate module ids", async () => {
    const module: TinyIdeModule = { id: "html", version: "0.1.0", init() {} };
    const host = new AppModuleHost(() => context());
    await host.initialize([module]);
    await expect(host.initialize([module])).rejects.toThrow("Module already initialized: html");
  });
});
