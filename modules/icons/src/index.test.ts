import { describe, expect, it, vi } from "vitest";
import type { ModuleContext } from "@tinyide/plugin-api";
import { WORKBENCH_BUILTIN_ICON_IDS } from "@tinyide/plugin-api";
import {
  brandIconPack,
  builtinIconPacks,
  builtinIcons,
  defaultIconPack,
  funIconPack,
  iconModule,
} from "./index";

describe("icon module", () => {
  it("publishes default, brand and fun packs", () => {
    expect(builtinIconPacks.map((pack) => pack.id)).toEqual([
      "tinyide.default",
      "tinyide.brand",
      "tinyide.fun",
    ]);
    for (const pack of [defaultIconPack, brandIconPack, funIconPack]) {
      expect(pack.icons.map((icon) => icon.id).sort()).toEqual(
        [...WORKBENCH_BUILTIN_ICON_IDS].sort(),
      );
    }
    expect(builtinIcons.every((icon) => icon.svg.includes("currentColor"))).toBe(true);
  });

  it("registers icons only through the public extension contract", () => {
    const dispose = vi.fn();
    const registerWorkbenchIconProvider = vi.fn(() => ({ dispose }));
    const registerResourceIconProvider = vi.fn(() => ({ dispose }));
    const context = {
      extensions: { registerWorkbenchIconProvider, registerResourceIconProvider },
      subscriptions: [],
    } as unknown as ModuleContext;
    iconModule.init(context);
    expect(registerWorkbenchIconProvider).toHaveBeenCalledOnce();
    expect(registerResourceIconProvider).toHaveBeenCalledOnce();
    expect(context.subscriptions).toHaveLength(2);
  });

  it("keeps unique icon ids inside each pack", () => {
    for (const pack of builtinIconPacks) {
      const ids = pack.icons.map((icon) => icon.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("default pack has no hardcoded brand hex fills", () => {
    for (const icon of defaultIconPack.icons) {
      expect(icon.svg).not.toMatch(/fill="#[0-9a-fA-F]{3,8}"/);
      expect(icon.svg).toContain("currentColor");
    }
  });

  it("fun pack uses colorful fills", () => {
    expect(funIconPack.icons.some((icon) => /fill="#[0-9a-fA-F]{3,8}"/.test(icon.svg))).toBe(true);
    expect(funIconPack.icons.every((icon) => icon.svg.includes("<svg"))).toBe(true);
  });
});
