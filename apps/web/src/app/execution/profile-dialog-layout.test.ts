import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "../../styles/workbench.css"), "utf8");

function ruleFor(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  expect(match, `regra ausente: ${selector}`).not.toBeNull();
  return match?.[1] ?? "";
}

describe("profile dialog layout", () => {
  it("keeps the profile list scrollable without compressing profile cards", () => {
    const panel = ruleFor(".profile-list-panel");
    expect(panel).toMatch(/grid-template-rows:\s*auto\s+minmax\(0,\s*1fr\)\s+auto\s+auto/);
    expect(panel).toMatch(/overflow:\s*hidden/);

    const list = ruleFor(".profile-list");
    expect(list).toMatch(/display:\s*flex/);
    expect(list).toMatch(/min-height:\s*0/);
    expect(list).toMatch(/flex-direction:\s*column/);
    expect(list).toMatch(/overflow-y:\s*auto/);
    expect(list).toMatch(/scrollbar-gutter:\s*stable/);

    const card = ruleFor(".profile-card");
    expect(card).toMatch(/flex:\s*0\s+0\s+auto/);
  });
});
