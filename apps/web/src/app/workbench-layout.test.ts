import { describe, expect, it } from "vitest";
import {
  closeSidebarForSide,
  maximumSidebarWidth,
  moveOpenSidebar,
  reconcileToolWindowLayout,
  sidebarActivityKey,
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
