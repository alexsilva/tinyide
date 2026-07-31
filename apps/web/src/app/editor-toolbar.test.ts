import fs from "node:fs";
import { describe, expect, it } from "vitest";

const appSource = fs.readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

describe("editor toolbar contributions", () => {
  it("keeps disabled plugin actions visible and disables their buttons", () => {
    const toolbarUpdateStart = appSource.indexOf("setEditorToolbarItems(items.flat()");
    const toolbarUpdate = appSource.slice(toolbarUpdateStart, toolbarUpdateStart + 240);

    expect(toolbarUpdateStart).toBeGreaterThanOrEqual(0);
    expect(toolbarUpdate).not.toContain(".filter((item) => item.enabled !== false)");
    expect(appSource).toContain("disabled={item.enabled === false}");
  });

  it("renders navigation icons contributed by plugins", () => {
    expect(appSource).toContain('item.icon === "back" ? <ArrowLeft');
    expect(appSource).toContain('item.icon === "forward" ? <ArrowRight');
  });
});
