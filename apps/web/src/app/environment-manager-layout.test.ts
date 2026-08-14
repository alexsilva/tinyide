import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const featuresCss = readFileSync(new URL("../styles/features.css", import.meta.url), "utf8");

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return featuresCss.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))?.[1] ?? "";
}

describe("environment manager layout", () => {
  it("scrolls the complete panel instead of clipping controls above the lists", () => {
    const manager = rule(".sidebar-content.environment-manager");
    expect(manager).toContain("overflow-y: auto");
    expect(manager).not.toContain("overflow: hidden");
    expect(manager).toContain("scrollbar-gutter: stable");

    expect(rule(".environment-list")).toContain("flex: 0 0 auto");
    expect(rule(".environment-list")).toContain("overflow: visible");
    expect(rule(".package-manager")).toContain("flex: 0 0 auto");
    expect(rule(".package-list")).toContain("overflow: visible");
  });

  it("renders the default-environment choice as a compact radio control", () => {
    expect(rule(".environment-default-choice")).toContain("cursor: pointer");
    expect(rule(".environment-default-choice input")).toContain("width: 13px");
    expect(rule(".environment-default-choice input")).toContain("height: 13px");
    expect(featuresCss).toContain(".environment-default-choice:has(input:checked),\n.environment-default-single { border-color: #5875cf");
  });
});
