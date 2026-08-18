import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(appDirectory, "../../../..");

const visualPlugins = [
  { name: "Search", path: "plugins/search/src/index.js", selector: ".tinyide-search__results" },
  { name: "Git", path: "plugins/git/src/index.js", selector: ".tinyide-git" },
  { name: "Docker", path: "plugins/docker/src/index.js", selector: ".tinyide-docker" },
  { name: "Node Runtime", path: "plugins/node-runtime/src/index.js", selector: ".tinyide-node-runtime" },
  { name: "Database", path: "plugins/database/src/index.js", selector: ".tinyide-db-grid" },
  { name: "Pytest", path: "plugins/pytest/src/index.js", selector: ".tinyide-pytest" },
  { name: "Terminal", path: "plugins/terminal/src/index.js", selector: ".tinyide-terminal-panel" },
  { name: "Markdown", path: "plugins/markdown/src/index.js", selector: "[data-markdown-preview-host]" },
] as const;

function sourceFor(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

function escapedRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("plugin theme contract", () => {
  it.each(visualPlugins)("keeps $name primary surfaces driven by workbench theme tokens", ({ path, selector }) => {
    const source = sourceFor(path);
    const escapedSelector = escapedRegExp(selector);
    const themedBackground = new RegExp(`${escapedSelector}\\s*\\{[^}]*background\\s*:\\s*var\\(`, "i");
    const literalBackground = new RegExp(`${escapedSelector}\\s*\\{[^}]*background\\s*:\\s*#[0-9a-f]{3,8}\\b`, "i");

    expect(source, path).toMatch(/var\(--(?:bg|surface-[1-4]|surface-panel|surface-input|surface-editor)/);
    expect(source, path).toMatch(/var\(--(?:text|muted|text-subtle)/);
    expect(source, `${path} :: ${selector}`).toMatch(themedBackground);
    expect(source, `${path} :: ${selector}`).not.toMatch(literalBackground);
  });

  it("does not force a dark native color scheme inside visual plugins", () => {
    for (const { path } of visualPlugins) {
      expect(sourceFor(path), path).not.toMatch(/color-scheme\s*:\s*dark\b/i);
    }
  });

  it("keeps xterm palette colors theme-driven instead of freezing the previous dark palette", () => {
    const terminal = sourceFor("plugins/terminal/src/index.js");
    const constructor = terminal.slice(
      terminal.indexOf("new TerminalConstructor"),
      terminal.indexOf("new TerminalConstructor") + 1_500,
    );

    expect(constructor).not.toMatch(/background\s*:\s*["']#[0-9a-f]{3,8}["']/i);
    expect(constructor).not.toMatch(/foreground\s*:\s*["']#[0-9a-f]{3,8}["']/i);
  });
});
