// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type {
  WorkbenchPanelHookContribution,
  WorkbenchTabApi,
  WorkbenchTabContribution,
  WorkbenchToolWindowHookContribution,
} from "@tinyide/plugin-api";
import {
  expandWorkbenchPanelContribution,
  expandWorkbenchToolWindowContribution,
} from "./plugin-contributions";

describe("plugin contribution expansion", () => {
  it("expands grouped panel tabs without changing plugin identity", () => {
    const firstMount = vi.fn();
    const secondMount = vi.fn();
    const contribution = {
      id: "plugin.panel.group",
      pluginId: "plugin.example",
      label: "Grupo",
      order: 8,
      tabs: [
        { id: "first", label: "Primeiro", mount: firstMount },
        { id: "second", label: "Segundo", order: 2, mount: secondMount },
      ],
    } as WorkbenchPanelHookContribution;

    const expanded = expandWorkbenchPanelContribution(contribution);

    expect(expanded).toHaveLength(2);
    expect(expanded[0]).toMatchObject({ id: "first", pluginId: "plugin.example", order: 8 });
    expect(expanded[1]).toMatchObject({ id: "second", pluginId: "plugin.example", order: 2 });
    expect(expanded[0]?.mount).toBe(firstMount);
    expect(expanded[1]?.mount).toBe(secondMount);
  });

  it("mounts grouped tool-window views once and disposes views and tabs", async () => {
    const firstDispose = vi.fn();
    const secondDispose = vi.fn();
    const firstMount = vi.fn(() => ({ dispose: firstDispose }));
    const secondMount = vi.fn(async () => ({ dispose: secondDispose }));
    const activityBadge = {
      snapshot: () => ({ value: 2, label: "2 ativos", tone: "active" as const }),
      subscribe: vi.fn(() => ({ dispose: vi.fn() })),
    };
    const contribution = {
      id: "plugin.tool.group",
      pluginId: "plugin.example",
      label: "Ferramentas",
      activityBadge,
      views: [
        { id: "second", label: "Segundo", order: 2, mount: secondMount },
        { id: "first", label: "Primeiro", order: 1, mount: firstMount },
      ],
    } as WorkbenchToolWindowHookContribution;
    const [expanded] = expandWorkbenchToolWindowContribution(contribution);
    expect(expanded?.activityBadge).toBe(activityBadge);
    const headerContainer = document.createElement("div");
    const container = document.createElement("div");
    const selected: string[] = [];
    const registered: string[] = [];
    const tabDisposals: ReturnType<typeof vi.fn>[] = [];
    const tabs = {
      register(item: WorkbenchTabContribution) {
        registered.push(item.id);
        const dispose = vi.fn();
        tabDisposals.push(dispose);
        return { dispose };
      },
      select(id: string) {
        selected.push(id);
      },
    } as unknown as WorkbenchTabApi;

    const disposable = await expanded?.mount({
      headerContainer,
      container,
      state: {} as never,
      tabs,
      close: vi.fn(),
    });
    await Promise.resolve();

    expect(registered).toEqual(["first", "second"]);
    expect(selected).toEqual(["first"]);
    expect(firstMount).toHaveBeenCalledTimes(1);
    expect(secondMount).toHaveBeenCalledTimes(1);
    expect(container.querySelectorAll("section")).toHaveLength(2);

    disposable?.dispose();
    expect(firstDispose).toHaveBeenCalledTimes(1);
    expect(secondDispose).toHaveBeenCalledTimes(1);
    expect(tabDisposals.every((dispose) => dispose.mock.calls.length === 1)).toBe(true);
    expect(container.childElementCount).toBe(0);
  });
});
