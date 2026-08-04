import { describe, expect, it } from "vitest";
import type { LanguageProvider } from "@tinyide/plugin-api";
import {
  genericSyntaxKindFor,
  highlightGenericSyntax,
  pluginLanguageProviderFor,
  resolveSyntaxHighlighter,
} from "./generic-syntax";

function provider(id: string, extensions: readonly string[], marker: string): LanguageProvider {
  return {
    id,
    name: id,
    extensions,
    highlight(source) {
      const start = source.indexOf(marker);
      return start < 0 ? [] : [{ start, end: start + marker.length, scope: "class" }];
    },
    async lint() { return []; },
  };
}

describe("generic syntax highlighting", () => {
  it("detects common file families from extension, special name and media type", () => {
    expect(genericSyntaxKindFor({ fileName: "component.html" })).toBe("plain");
    expect(genericSyntaxKindFor({ fileName: "theme.scss" })).toBe("stylesheet");
    expect(genericSyntaxKindFor({ fileName: "settings.yaml" })).toBe("data");
    expect(genericSyntaxKindFor({ fileName: ".env.local" })).toBe("config");
    expect(genericSyntaxKindFor({ fileName: "Dockerfile" })).toBe("shell");
    expect(genericSyntaxKindFor({ fileName: "README", mediaType: "text/markdown" })).toBe("markdown");
    expect(genericSyntaxKindFor({ fileName: "unknown.custom" })).toBe("plain");
  });

  it("highlights useful lexical structures even without a language plugin", () => {
    const source = `// fallback\nconst answer = 42;\nrender("ok");`;
    const tokens = highlightGenericSyntax({ fileName: "example.custom", source });
    const scopes = new Set(tokens.map((token) => token.scope));
    expect(scopes.has("comment")).toBe(true);
    expect(scopes.has("keyword")).toBe(true);
    expect(scopes.has("number")).toBe(true);
    expect(scopes.has("function")).toBe(true);
    expect(scopes.has("string")).toBe(true);
  });

  it("gives a matching plugin complete precedence over the generic fallback", () => {
    const custom = provider("custom-language", [".custom"], "PLUGIN_TOKEN");
    const source = "const PLUGIN_TOKEN = 42";
    const highlighter = resolveSyntaxHighlighter({ fileName: "file.custom", source }, [custom]);

    expect(highlighter).toMatchObject({ id: "custom-language", origin: "plugin" });
    expect(highlighter.highlight(source)).toEqual([
      expect.objectContaining({ scope: "class", start: 6, end: 18 }),
    ]);
  });

  it("selects the most specific plugin extension before registration order", () => {
    const broad = provider("broad", [".js"], "broad");
    const specific = provider("specific", [".test.js"], "specific");
    expect(pluginLanguageProviderFor({ fileName: "module.test.js" }, [broad, specific])?.id).toBe("specific");
  });

  it("lets a plugin replace a lower-priority module provider", () => {
    const moduleProvider = { ...provider("module-html", [".html"], "module"), priority: -1000 };
    const pluginProvider = provider("plugin-html", [".html"], "plugin");
    expect(pluginLanguageProviderFor({ fileName: "index.html" }, [moduleProvider, pluginProvider])?.id).toBe("plugin-html");
  });

  it("returns a stable generic provider id through the shared resolver", () => {
    const source = "name = true";
    const highlighter = resolveSyntaxHighlighter({ fileName: "app.toml", source }, []);
    expect(highlighter).toMatchObject({ id: "generic.config", origin: "generic" });
    expect(highlighter.highlight(source).length).toBeGreaterThan(0);
  });
});
