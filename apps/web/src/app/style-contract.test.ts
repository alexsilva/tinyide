import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import postcss, { type AtRule, type Rule } from "postcss";
import { describe, expect, it } from "vitest";

const appDirectory = dirname(new URL(import.meta.url).pathname);
const sourceDirectory = resolve(appDirectory, "..");
const entryPath = resolve(sourceDirectory, "app.css");
const expectedImports = [
  "./styles/foundation.css",
  "./styles/workbench.css",
  "./styles/features.css",
] as const;

function parseCss(path: string) {
  return postcss.parse(readFileSync(path, "utf8"), { from: path });
}

function ruleContext(rule: Rule): string {
  const context: string[] = [];
  let parent = rule.parent;
  while (parent && parent.type !== "root") {
    if (parent.type === "atrule") {
      const atRule = parent as AtRule;
      context.unshift(`@${atRule.name} ${atRule.params}`.trim());
    }
    parent = parent.parent;
  }
  return context.join(" > ");
}

function normalizedSelector(selector: string): string {
  return selector.trim().replace(/\s+/g, " ");
}

function duplicateSelectors(path: string): readonly string[] {
  const selectors = new Map<string, number[]>();
  parseCss(path).walkRules((rule) => {
    const key = `${ruleContext(rule)} :: ${normalizedSelector(rule.selector)}`;
    const lines = selectors.get(key) ?? [];
    lines.push(rule.source?.start?.line ?? 0);
    selectors.set(key, lines);
  });
  return [...selectors.entries()]
    .filter(([, lines]) => lines.length > 1)
    .map(([selector, lines]) => `${selector} (${lines.join(", ")})`);
}

function forbiddenGlobalSelectors(path: string): readonly string[] {
  const forbidden: string[] = [];
  parseCss(path).walkRules((rule) => {
    for (const selector of rule.selectors) {
      const first = selector.trim().split(/[\s>+~:[.#]/, 1)[0] ?? "";
      if (selector.trim().startsWith("*") || ["html", "body", "button", "input", "textarea", "select"].includes(first)) {
        forbidden.push(`${selector} (${rule.source?.start?.line ?? 0})`);
      }
    }
  });
  return forbidden;
}

describe("CSS architecture contract", () => {
  it("keeps a single ordered stylesheet entrypoint", () => {
    const entry = parseCss(entryPath);
    const imports = entry.nodes
      .filter((node): node is AtRule => node.type === "atrule" && node.name === "import")
      .map((node) => node.params.replace(/^['\"]|['\"]$/g, ""));
    const nonImports = entry.nodes.filter((node) => node.type !== "comment" && !(node.type === "atrule" && node.name === "import"));

    expect(imports).toEqual(expectedImports);
    expect(nonImports).toEqual([]);
    expect(existsSync(resolve(sourceDirectory, "styles.css"))).toBe(false);
  });

  it("parses every owned stylesheet and rejects duplicate overrides", () => {
    for (const importPath of expectedImports) {
      const path = resolve(sourceDirectory, importPath);
      expect(() => parseCss(path)).not.toThrow();
      expect(duplicateSelectors(path), path).toEqual([]);
    }
  });

  it("allows global element selectors only in foundation.css", () => {
    for (const importPath of expectedImports.slice(1)) {
      const path = resolve(sourceDirectory, importPath);
      expect(forbiddenGlobalSelectors(path), path).toEqual([]);
    }
  });
});
