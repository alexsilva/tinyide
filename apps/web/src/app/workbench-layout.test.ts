import { describe, expect, it } from "vitest";
import {
  closeSidebarForSide,
  maximumSidebarWidth,
  moveOpenSidebar,
  reconcileToolWindowLayout,
  releaseMountedToolWindow,
  retainMountedToolWindows,
  sidebarActivityKey,
  openSidebarViewForSide,
  sidebarViewFromActivityKey,
  sidebarWidthForView,
  toggleSidebarViewForSide,
  updateVerticalPanelWidth,
} from "./workbench-layout";

describe("vertical sidebar layout", () => {
  it("keeps one sidebar per side and replaces only the same side", () => {
    const leftExplorer = toggleSidebarViewForSide({}, "left", "explorer");
    const withRightGit = toggleSidebarViewForSide(leftExplorer, "right", "git.changes");
    expect(withRightGit).toEqual({ left: "explorer", right: "git.changes" });
    expect(toggleSidebarViewForSide(withRightGit, "left", "plugins")).toEqual({
      left: "plugins",
      right: "git.changes",
    });
  });

  it("never keeps the same view open on both sides", () => {
    const current = { left: "git.changes" } as const;
    expect(toggleSidebarViewForSide(current, "right", "git.changes")).toEqual({
      right: "git.changes",
    });
    expect(openSidebarViewForSide(current, "right", "git.changes")).toEqual({
      right: "git.changes",
    });
    expect(openSidebarViewForSide({ left: "git.changes" }, "left", "git.changes")).toEqual({
      left: "git.changes",
    });
  });

  it("closes and moves only the requested side", () => {
    const current = { left: "explorer", right: "git.changes" } as const;
    expect(closeSidebarForSide(current, "left")).toEqual({ right: "git.changes" });
    expect(moveOpenSidebar(current, "git.changes", "right", "left")).toEqual({ left: "git.changes" });
  });

  it("maps sidebar views to activity keys", () => {
    expect(sidebarActivityKey("explorer")).toBe("builtin:explorer");
    expect(sidebarActivityKey("git.changes")).toBe("sidebar:git.changes");
    expect(sidebarViewFromActivityKey("builtin:plugins")).toBe("plugins");
    expect(sidebarViewFromActivityKey("sidebar:git.changes")).toBe("git.changes");
    expect(sidebarViewFromActivityKey("toolWindow:git")).toBeUndefined();
  });

  it("resizes each vertical column independently", () => {
    const initial = { left: 280, right: 320 } as const;
    const resizedLeft = updateVerticalPanelWidth(initial, "left", 460);
    expect(resizedLeft).toEqual({ left: 460, right: 320 });
    expect(updateVerticalPanelWidth(resizedLeft, "right", 510)).toEqual({
      left: 460,
      right: 510,
    });
  });
});

describe("sidebar sizing", () => {
  it("limits the environments view without constraining other sidebars", () => {
    expect(maximumSidebarWidth("environments")).toBe(520);
    expect(maximumSidebarWidth("explorer")).toBe(720);
    expect(sidebarWidthForView(700, "environments")).toBe(520);
    expect(sidebarWidthForView(700, "explorer")).toBe(700);
  });

  it("preserves the sidebar minimum width", () => {
    expect(sidebarWidthForView(100, "environments")).toBe(180);
  });
});

describe("workbench layout restoration", () => {
  it("does not discard persisted state before plugin restoration completes", () => {
    expect(reconcileToolWindowLayout({
      initialized: false,
      availableIds: [],
      current: { activeToolWindowId: "terminal", toolWindowVisible: false },
    })).toEqual({ activeToolWindowId: "terminal", toolWindowVisible: false });
  });

  it("selects an available tool window without reopening a closed region", () => {
    expect(reconcileToolWindowLayout({
      initialized: true,
      availableIds: ["terminal"],
      current: { activeToolWindowId: "removed", toolWindowVisible: false },
    })).toEqual({ activeToolWindowId: "terminal", toolWindowVisible: false });
  });

  it("preserves a valid visible tool window", () => {
    expect(reconcileToolWindowLayout({
      initialized: true,
      availableIds: ["terminal", "database"],
      current: { activeToolWindowId: "database", toolWindowVisible: true },
    })).toEqual({ activeToolWindowId: "database", toolWindowVisible: true });
  });

  it("closes the region when no tool windows remain", () => {
    expect(reconcileToolWindowLayout({
      initialized: true,
      availableIds: [],
      current: { activeToolWindowId: "terminal", toolWindowVisible: true },
    })).toEqual({ toolWindowVisible: false });
  });
});

describe("mounted tool window retention", () => {
  it("mounts the active tool window when the region is visible", () => {
    expect([...retainMountedToolWindows(new Set(), {
      activeToolWindowId: "terminal",
      toolWindowVisible: true,
      availableIds: ["terminal", "database"],
    })]).toEqual(["terminal"]);
  });

  it("does not mount anything while the region is hidden", () => {
    expect(retainMountedToolWindows(new Set(), {
      activeToolWindowId: "terminal",
      toolWindowVisible: false,
      availableIds: ["terminal"],
    }).size).toBe(0);
  });

  it("keeps previously mounted tool windows alive when another becomes active", () => {
    const previous = retainMountedToolWindows(new Set(), {
      activeToolWindowId: "terminal",
      toolWindowVisible: true,
      availableIds: ["terminal", "database"],
    });
    expect([...retainMountedToolWindows(previous, {
      activeToolWindowId: "database",
      toolWindowVisible: true,
      availableIds: ["terminal", "database"],
    })].sort()).toEqual(["database", "terminal"]);
  });

  it("keeps mounted tool windows when the region closes", () => {
    const previous = new Set(["terminal"]);
    expect(retainMountedToolWindows(previous, {
      activeToolWindowId: "terminal",
      toolWindowVisible: false,
      availableIds: ["terminal"],
    })).toBe(previous);
  });

  it("prunes tool windows that are no longer available", () => {
    expect([...retainMountedToolWindows(new Set(["terminal", "removed"]), {
      activeToolWindowId: "terminal",
      toolWindowVisible: true,
      availableIds: ["terminal"],
    })]).toEqual(["terminal"]);
  });

  it("returns the same reference when nothing changes", () => {
    const previous = new Set(["terminal"]);
    expect(retainMountedToolWindows(previous, {
      activeToolWindowId: "terminal",
      toolWindowVisible: true,
      availableIds: ["terminal", "database"],
    })).toBe(previous);
  });
});

describe("released tool windows (detached to an OS window)", () => {
  it("unmounts the detached tool window and keeps the others", () => {
    expect([...releaseMountedToolWindow(new Set(["terminal", "database"]), "terminal")])
      .toEqual(["database"]);
  });

  it("returns the same reference when the id is not mounted", () => {
    const previous = new Set(["database"]);
    expect(releaseMountedToolWindow(previous, "terminal")).toBe(previous);
  });

  it("stays unmounted while the region is hidden, and remounts on reattach", () => {
    const released = releaseMountedToolWindow(new Set(["terminal"]), "terminal");
    // O detach oculta a região; a retenção não pode ressuscitar o host oculto.
    expect(retainMountedToolWindows(released, {
      activeToolWindowId: "terminal",
      toolWindowVisible: false,
      availableIds: ["terminal"],
    }).size).toBe(0);
    // Reanexar reapresenta a superfície: ativa + visível volta a montar.
    expect([...retainMountedToolWindows(released, {
      activeToolWindowId: "terminal",
      toolWindowVisible: true,
      availableIds: ["terminal"],
    })]).toEqual(["terminal"]);
  });
});
