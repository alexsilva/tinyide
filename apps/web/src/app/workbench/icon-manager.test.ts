import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkbenchIconPackDefinition, WorkbenchIconProvider } from "@tinyide/plugin-api";
import {
  applyWorkbenchIconPack,
  resolveIconPack,
  resolveWorkbenchIcon,
  subscribeWorkbenchIcons,
  workbenchIconDefaults,
  workbenchIconPacks,
} from "./icon-manager";

function pack(
  id: string,
  order = 0,
  icons: WorkbenchIconPackDefinition["icons"] = [],
): WorkbenchIconPackDefinition {
  return {
    id,
    label: id,
    order,
    icons: icons.length
      ? icons
      : [{ id: "box", label: "Box", svg: `<svg data-pack="${id}"></svg>`, order: 0 }],
  };
}

afterEach(() => {
  applyWorkbenchIconPack(undefined);
  vi.unstubAllGlobals();
});

describe("icon manager", () => {
  it("keeps the highest-priority contribution for duplicate icon ids", () => {
    const low: WorkbenchIconProvider = {
      id: "low",
      priority: 1,
      packs: () => [pack("same", 20), pack("other", 10)],
    };
    const highPack = { ...pack("same", 30), label: "override" };
    const high: WorkbenchIconProvider = { id: "high", priority: 5, packs: () => [highPack] };
    const platform = { capabilities: { getAll: () => [low, high] } } as never;
    expect(workbenchIconPacks(platform)).toEqual([pack("other", 10), highPack]);
  });

  it("merges icons contributed to an existing pack instead of replacing it", () => {
    const builtin: WorkbenchIconProvider = {
      id: "builtin",
      priority: 0,
      packs: () => [pack("tinyide.default", 10, [
        { id: "box", label: "Box", svg: "<svg data-id=\"box\"></svg>", order: 0 },
        { id: "files", label: "Files", svg: "<svg data-id=\"files\"></svg>", order: 1 },
      ])],
    };
    // Um plugin só quer acrescentar o próprio ícone; não conhece os outros nem o nome do pack.
    const plugin: WorkbenchIconProvider = {
      id: "plugin",
      priority: 10,
      packs: () => [{ id: "tinyide.default", icons: [{ id: "flags", label: "Flags", svg: "<svg data-id=\"flags\"></svg>", order: 2 }] }],
    };
    const platform = { capabilities: { getAll: () => [builtin, plugin] } } as never;
    const merged = workbenchIconPacks(platform).at(0);
    expect(merged?.label).toBe("tinyide.default");
    expect(merged?.icons.map((icon) => icon.id)).toEqual(["box", "files", "flags"]);
  });

  it("falls back to the default builtin pack when the stored id is unavailable", () => {
    const fallback = pack(workbenchIconDefaults.packId);
    expect(resolveIconPack([pack("other"), fallback], "missing")).toBe(fallback);
  });

  it("resolves icons from the active pack and falls back to box", () => {
    applyWorkbenchIconPack(pack("active", 0, [
      { id: "files", label: "Files", svg: "<svg data-id=\"files\"></svg>" },
      { id: "box", label: "Box", svg: "<svg data-id=\"box\"></svg>" },
    ]));
    expect(resolveWorkbenchIcon("files")?.svg).toContain("files");
    expect(resolveWorkbenchIcon("missing")?.svg).toContain("box");
    expect(resolveWorkbenchIcon(undefined)?.svg).toContain("box");
  });

  it("notifies subscribers when the active pack changes", () => {
    const listener = vi.fn();
    const dispose = subscribeWorkbenchIcons(listener);
    applyWorkbenchIconPack(pack("notify"));
    expect(listener).toHaveBeenCalledOnce();
    dispose();
    applyWorkbenchIconPack(pack("after"));
    expect(listener).toHaveBeenCalledOnce();
  });
});
