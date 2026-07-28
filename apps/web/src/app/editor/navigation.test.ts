import { describe, expect, it, vi } from "vitest";
import type {
  TextEditorNavigationContext,
  TextEditorNavigationProvider,
} from "@tinyide/plugin-api";
import { resolveTextEditorNavigation } from "./navigation";

const context: TextEditorNavigationContext = {
  document: { id: "file.py", name: "file.py", path: "file.py", content: "target()" },
  position: { line: 1, column: 2 },
  offset: 1,
  kind: "definition",
};

function provider(
  id: string,
  priority: number,
  targets: Awaited<ReturnType<TextEditorNavigationProvider["provideTargets"]>>,
  canNavigate = true,
): { provider: TextEditorNavigationProvider; provideTargets: ReturnType<typeof vi.fn> } {
  const provideTargets = vi.fn(async () => targets);
  return { provider: {
    id,
    pluginId: id,
    priority,
    canNavigate: () => canNavigate,
    provideTargets,
  }, provideTargets };
}

describe("text editor navigation", () => {
  it("uses the highest-priority provider that resolves a target", async () => {
    const fallback = provider("fallback", 1, [{
      path: "fallback.py",
      range: { start: { line: 1, column: 1 }, end: { line: 1, column: 9 } },
    }]);
    const preferred = provider("preferred", 10, []);
    await expect(resolveTextEditorNavigation([fallback.provider, preferred.provider], context))
      .resolves.toMatchObject({ path: "fallback.py" });
    expect(preferred.provideTargets).toHaveBeenCalledBefore(fallback.provideTargets);
  });

  it("ignores providers that do not support the document", async () => {
    const unsupported = provider("unsupported", 100, [], false);
    await expect(resolveTextEditorNavigation([unsupported.provider], context)).resolves.toBeUndefined();
    expect(unsupported.provideTargets).not.toHaveBeenCalled();
  });
});
