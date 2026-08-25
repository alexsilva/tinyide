import { describe, expect, it } from "vitest";
import {
  isActivityDragClick,
  moveActivityButton,
  orderedActivityButtons,
  type ActivityButtonDescriptor,
} from "./activity-layout";

const items: readonly ActivityButtonDescriptor[] = [
  { key: "builtin:explorer", defaultOrder: 0 },
  { key: "sidebar:git", defaultOrder: 100, movable: true },
  { key: "builtin:plugins", defaultOrder: 1_000 },
  { key: "toolWindow:docker", defaultOrder: 2_000, movable: true },
  { key: "toolWindow:terminal", defaultOrder: 3_000, movable: true },
];

describe("activity button layout", () => {
  it("uses contribution order until the user customizes the layout", () => {
    expect(orderedActivityButtons(items, {}, "left").map((item) => item.key)).toEqual([
      "builtin:explorer",
      "sidebar:git",
      "builtin:plugins",
      "toolWindow:docker",
      "toolWindow:terminal",
    ]);
    expect(orderedActivityButtons(items, {}, "right")).toEqual([]);
  });

  it("moves buttons between bars and preserves their relative order", () => {
    const placements = moveActivityButton(items, {}, "toolWindow:docker", "right");
    expect(orderedActivityButtons(items, placements, "left").map((item) => item.key)).toEqual([
      "builtin:explorer",
      "sidebar:git",
      "builtin:plugins",
      "toolWindow:terminal",
    ]);
    expect(orderedActivityButtons(items, placements, "right").map((item) => item.key)).toEqual([
      "toolWindow:docker",
    ]);
  });

  it("inserts a button before or after another button", () => {
    const before = moveActivityButton(items, {}, "toolWindow:terminal", "left", "builtin:plugins");
    expect(orderedActivityButtons(items, before, "left").map((item) => item.key)).toEqual([
      "builtin:explorer",
      "sidebar:git",
      "toolWindow:terminal",
      "builtin:plugins",
      "toolWindow:docker",
    ]);

    const after = moveActivityButton(items, before, "toolWindow:terminal", "left", "toolWindow:docker", true);
    expect(orderedActivityButtons(items, after, "left").map((item) => item.key)).toEqual([
      "builtin:explorer",
      "sidebar:git",
      "builtin:plugins",
      "toolWindow:docker",
      "toolWindow:terminal",
    ]);
  });

  it("uses every button as a movable item and keeps spacers fixed", () => {
    const movableItems = items.map((item) => ({ ...item, movable: true }));
    const placements = moveActivityButton(items, {}, "toolWindow:docker", "left", "builtin:explorer");
    expect(orderedActivityButtons(items, placements, "left").map((item) => item.key)).toEqual([
      "toolWindow:docker",
      "builtin:explorer",
      "sidebar:git",
      "builtin:plugins",
      "toolWindow:terminal",
    ]);
    expect(placements["builtin:explorer"]).toBeUndefined();

    const movedBuiltin = moveActivityButton(movableItems, placements, "builtin:explorer", "right");
    expect(orderedActivityButtons(movableItems, movedBuiltin, "right").map((item) => item.key)).toEqual([
      "builtin:explorer",
    ]);

    const withSpacer = [
      ...movableItems,
      { key: "builtin:left-spacer", defaultOrder: 10_000 },
    ];
    expect(moveActivityButton(withSpacer, movedBuiltin, "builtin:left-spacer", "right")).toBe(movedBuiltin);
  });
});

describe("activity drag treated as click", () => {
  it("accepts a gesture that ends where it started", () => {
    expect(isActivityDragClick({ x: 18, y: 120 }, { x: 22, y: 123 })).toBe(true);
    expect(isActivityDragClick({ x: 18, y: 120 }, { x: 18, y: 120 })).toBe(true);
  });

  it("rejects a real reorder and a drop outside the window", () => {
    expect(isActivityDragClick({ x: 18, y: 120 }, { x: 18, y: 156 })).toBe(false);
    expect(isActivityDragClick({ x: 18, y: 120 }, { x: 0, y: 0 })).toBe(false);
    expect(isActivityDragClick(undefined, { x: 18, y: 120 })).toBe(false);
  });

  it("keeps the layout untouched when the button is dropped on itself", () => {
    const placements = moveActivityButton(items, {}, "sidebar:git", "left", "sidebar:git");
    expect(placements).toEqual({});
    expect(orderedActivityButtons(items, placements, "left").map((item) => item.key)).toEqual([
      "builtin:explorer",
      "sidebar:git",
      "builtin:plugins",
      "toolWindow:docker",
      "toolWindow:terminal",
    ]);
  });
});
