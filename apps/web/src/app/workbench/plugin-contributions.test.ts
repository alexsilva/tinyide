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
  it("returns direct panel and tool-window contributions unchanged", () => {
    const panel = {
      id: "panel",
      pluginId: "plugin.example",
      label: "Panel",
      mount: vi.fn(),
    } as unknown as WorkbenchPanelHookContribution;
    const toolWindow = {
      id: "tool",
      pluginId: "plugin.example",
      label: "Tool",
      mount: vi.fn(),
    } as unknown as WorkbenchToolWindowHookContribution;

    expect(expandWorkbenchPanelContribution(panel)).toEqual([panel]);
    expect(expandWorkbenchToolWindowContribution(toolWindow)).toEqual([toolWindow]);
  });

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

  it("mounts grouped tool-window views lazily and releases hidden views by default", async () => {
    const firstDispose = vi.fn();
    const secondDispose = vi.fn();
    const firstMount = vi.fn(() => ({ dispose: firstDispose }));
    const secondMount = vi.fn(async () => ({ dispose: secondDispose }));
    const firstMountStatus = vi.fn();
    const activityBadge = {
      snapshot: () => ({ value: 2, label: "2 ativos", tone: "active" as const }),
      subscribe: vi.fn(() => ({ dispose: vi.fn() })),
    };
    const contribution = {
      id: "plugin.tool.group",
      pluginId: "plugin.example",
      label: "Ferramentas",
      activityBadge,
      retainWhenHidden: true,
      views: [
        { id: "second", label: "Segundo", order: 2, placement: "end", mount: secondMount },
        { id: "first", label: "Primeiro", order: 1, mountStatus: firstMountStatus, mount: firstMount },
      ],
    } as WorkbenchToolWindowHookContribution;
    const [expanded] = expandWorkbenchToolWindowContribution(contribution);
    expect(expanded?.activityBadge).toBe(activityBadge);
    expect(expanded?.retainWhenHidden).toBe(true);
    const headerContainer = document.createElement("div");
    const container = document.createElement("div");
    const selected: string[] = [];
    const registered: string[] = [];
    const registeredTabs: WorkbenchTabContribution[] = [];
    const tabDisposals: ReturnType<typeof vi.fn>[] = [];
    const tabs = {
      register(item: WorkbenchTabContribution) {
        registered.push(item.id);
        registeredTabs.push(item);
        const dispose = vi.fn();
        tabDisposals.push(dispose);
        return { dispose };
      },
      select(id: string) {
        selected.push(id);
        registeredTabs.find((item) => item.id === id)?.onSelect?.();
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
    expect(registeredTabs[0]?.mountStatus).toBe(firstMountStatus);
    expect(registeredTabs[1]?.placement).toBe("end");
    expect(selected).toEqual(["first"]);
    expect(firstMount).toHaveBeenCalledTimes(1);
    expect(secondMount).not.toHaveBeenCalled();
    expect(container.querySelectorAll("section")).toHaveLength(2);

    tabs.select("second");
    await Promise.resolve();
    expect(secondMount).toHaveBeenCalledTimes(1);
    expect(firstMount).toHaveBeenCalledTimes(1);
    expect(firstDispose).toHaveBeenCalledTimes(1);

    tabs.select("first");
    expect(firstMount).toHaveBeenCalledTimes(2);
    expect(secondDispose).toHaveBeenCalledTimes(1);

    disposable?.dispose();
    expect(firstDispose).toHaveBeenCalledTimes(2);
    expect(secondDispose).toHaveBeenCalledTimes(1);
    expect(tabDisposals.every((dispose) => dispose.mock.calls.length === 1)).toBe(true);
    expect(container.childElementCount).toBe(0);
  });

  it("supports an empty grouped tool window without mounting or selecting a view", async () => {
    const contribution = {
      id: "plugin.empty.tool.group",
      pluginId: "plugin.example",
      label: "Empty",
      views: [],
    } as WorkbenchToolWindowHookContribution;
    const [expanded] = expandWorkbenchToolWindowContribution(contribution);
    const select = vi.fn();
    const container = document.createElement("div");
    const disposable = await Promise.resolve(expanded?.mount({
      headerContainer: document.createElement("div"),
      container,
      state: {} as never,
      tabs: {
        register: vi.fn(),
        select,
      } as unknown as WorkbenchTabApi,
      close: vi.fn(),
    }));

    expect(select).not.toHaveBeenCalled();
    expect(container.childElementCount).toBe(0);
    disposable?.dispose();
  });

  it("renders non-Error mount failures without retry loops", async () => {
    const contribution = {
      id: "plugin.string.error.tool.group",
      pluginId: "plugin.example",
      label: "String errors",
      views: [
        { id: "sync", label: "Sync", order: 1, mount: () => { throw "sync failure"; } },
        { id: "async", label: "Async", order: 2, mount: async () => { throw "async failure"; } },
      ],
    } as WorkbenchToolWindowHookContribution;
    const [expanded] = expandWorkbenchToolWindowContribution(contribution);
    const container = document.createElement("div");
    const registeredTabs: WorkbenchTabContribution[] = [];
    const tabs = {
      register(item: WorkbenchTabContribution) {
        registeredTabs.push(item);
        return { dispose() {} };
      },
      select(id: string) {
        registeredTabs.find((item) => item.id === id)?.onSelect?.();
      },
    } as unknown as WorkbenchTabApi;
    const disposable = await Promise.resolve(expanded?.mount({
      headerContainer: document.createElement("div"),
      container,
      state: {} as never,
      tabs,
      close: vi.fn(),
    }));

    expect(container.querySelector('[data-view-id="sync"]')?.textContent).toBe("sync failure");
    tabs.select("async");
    await Promise.resolve();
    await Promise.resolve();
    expect(container.querySelector('[data-view-id="async"]')?.textContent).toBe("async failure");

    disposable?.dispose();
  });

  it("keeps only views that explicitly retain live state mounted while hidden", async () => {
    const firstDispose = vi.fn();
    const secondDispose = vi.fn();
    const firstMount = vi.fn(() => ({ dispose: firstDispose }));
    const secondMount = vi.fn(() => ({ dispose: secondDispose }));
    const contribution = {
      id: "plugin.retained.view.group",
      pluginId: "plugin.example",
      label: "Retained view",
      views: [
        { id: "first", label: "First", retainWhenHidden: true, mount: firstMount },
        { id: "second", label: "Second", mount: secondMount },
      ],
    } as WorkbenchToolWindowHookContribution;
    const [expanded] = expandWorkbenchToolWindowContribution(contribution);
    const registeredTabs: WorkbenchTabContribution[] = [];
    const tabs = {
      register(item: WorkbenchTabContribution) {
        registeredTabs.push(item);
        return { dispose() {} };
      },
      select(id: string) {
        registeredTabs.find((item) => item.id === id)?.onSelect?.();
      },
    } as unknown as WorkbenchTabApi;
    const disposable = await Promise.resolve(expanded?.mount({
      headerContainer: document.createElement("div"),
      container: document.createElement("div"),
      state: {} as never,
      tabs,
      close: vi.fn(),
    }));

    tabs.select("second");
    expect(firstMount).toHaveBeenCalledTimes(1);
    expect(firstDispose).not.toHaveBeenCalled();
    tabs.select("first");
    expect(firstMount).toHaveBeenCalledTimes(1);
    expect(secondDispose).toHaveBeenCalledTimes(1);

    disposable?.dispose();
    expect(firstDispose).toHaveBeenCalledTimes(1);
  });

  it("does not mount hidden grouped views before they are selected", async () => {
    const mounts = Array.from({ length: 100 }, () => vi.fn());
    const contribution = {
      id: "plugin.large.tool.group",
      pluginId: "plugin.example",
      label: "Large",
      views: mounts.map((mount, index) => ({
        id: `view-${index}`,
        label: `View ${index}`,
        order: index,
        mount,
      })),
    } as WorkbenchToolWindowHookContribution;
    const [expanded] = expandWorkbenchToolWindowContribution(contribution);
    const registeredTabs: WorkbenchTabContribution[] = [];
    const tabs = {
      register(item: WorkbenchTabContribution) {
        registeredTabs.push(item);
        return { dispose() {} };
      },
      select(id: string) {
        registeredTabs.find((item) => item.id === id)?.onSelect?.();
      },
    } as unknown as WorkbenchTabApi;

    const disposable = await Promise.resolve(expanded?.mount({
      headerContainer: document.createElement("div"),
      container: document.createElement("div"),
      state: {} as never,
      tabs,
      close: vi.fn(),
    }));

    expect(mounts.reduce((count, mount) => count + mount.mock.calls.length, 0)).toBe(1);
    tabs.select("view-99");
    expect(mounts.reduce((count, mount) => count + mount.mock.calls.length, 0)).toBe(2);
    disposable?.dispose();
  });

  it("disposes an async view that resolves after the grouped tool window was disposed", async () => {
    let resolveMount: ((value: { dispose(): void }) => void) | undefined;
    const disposeLate = vi.fn();
    const contribution = {
      id: "plugin.async.tool.group",
      pluginId: "plugin.example",
      label: "Async",
      views: [{
        id: "async",
        label: "Async",
        mount: () => new Promise<{ dispose(): void }>((resolve) => { resolveMount = resolve; }),
      }],
    } as WorkbenchToolWindowHookContribution;
    const [expanded] = expandWorkbenchToolWindowContribution(contribution);
    let selected: WorkbenchTabContribution | undefined;
    const tabs = {
      register(item: WorkbenchTabContribution) {
        selected = item;
        return { dispose() {} };
      },
      select() {
        selected?.onSelect?.();
      },
    } as unknown as WorkbenchTabApi;
    const disposable = await Promise.resolve(expanded?.mount({
      headerContainer: document.createElement("div"),
      container: document.createElement("div"),
      state: {} as never,
      tabs,
      close: vi.fn(),
    }));

    disposable?.dispose();
    resolveMount?.({ dispose: disposeLate });
    await Promise.resolve();

    expect(disposeLate).toHaveBeenCalledTimes(1);
  });

  it("surfaces an async grouped-view mount error while the host is alive", async () => {
    const contribution = {
      id: "plugin.async.error.tool.group",
      pluginId: "plugin.example",
      label: "Async error",
      views: [{
        id: "async-error",
        label: "Async error",
        mount: async () => {
          throw new Error("async view failed");
        },
      }],
    } as WorkbenchToolWindowHookContribution;
    const [expanded] = expandWorkbenchToolWindowContribution(contribution);
    const container = document.createElement("div");
    let selected: WorkbenchTabContribution | undefined;
    const tabs = {
      register(item: WorkbenchTabContribution) {
        selected = item;
        return { dispose() {} };
      },
      select() {
        selected?.onSelect?.();
      },
    } as unknown as WorkbenchTabApi;

    const disposable = await Promise.resolve(expanded?.mount({
      headerContainer: document.createElement("div"),
      container,
      state: {} as never,
      tabs,
      close: vi.fn(),
    }));
    await Promise.resolve();
    await Promise.resolve();

    expect(container.textContent).toContain("async view failed");
    disposable?.dispose();
  });

  it("surfaces a synchronous view mount error without retrying on every selection", async () => {
    const mount = vi.fn(() => {
      throw new Error("view failed");
    });
    const contribution = {
      id: "plugin.error.tool.group",
      pluginId: "plugin.example",
      label: "Error",
      views: [{ id: "error", label: "Error", mount }],
    } as WorkbenchToolWindowHookContribution;
    const [expanded] = expandWorkbenchToolWindowContribution(contribution);
    const container = document.createElement("div");
    let selected: WorkbenchTabContribution | undefined;
    const tabs = {
      register(item: WorkbenchTabContribution) {
        selected = item;
        return { dispose() {} };
      },
      select() {
        selected?.onSelect?.();
      },
    } as unknown as WorkbenchTabApi;

    const disposable = await Promise.resolve(expanded?.mount({
      headerContainer: document.createElement("div"),
      container,
      state: {} as never,
      tabs,
      close: vi.fn(),
    }));

    expect(container.textContent).toContain("view failed");
    selected?.onSelect?.();
    expect(mount).toHaveBeenCalledTimes(1);
    disposable?.dispose();
  });
});
