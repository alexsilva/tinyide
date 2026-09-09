// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import type {
  WorkbenchResourceEditorMountContext,
  WorkbenchResourceEditorProvider,
} from "@tinyide/plugin-api";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenDocument } from "../../browser-filesystem";
import { EditorDocumentSurface } from "./EditorDocumentSurface";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

function documentFor(kind: OpenDocument["kind"]): OpenDocument {
  return {
    id: `doc-${kind}`,
    name: `sample.${kind}`,
    kind,
    mediaType: kind === "text" ? "text/plain" : "application/octet-stream",
    size: 8,
    content: "sample",
    savedContent: "sample",
    selectionStart: 0,
    selectionEnd: 0,
    scrollTop: 0,
    scrollLeft: 0,
  };
}

function renderSurface(
  document: OpenDocument | undefined,
  provider?: WorkbenchResourceEditorProvider,
) {
  host = window.document.createElement("div");
  window.document.body.append(host);
  root = createRoot(host);
  const onRevealResourceLine = vi.fn();

  act(() => {
    root?.render(
      <EditorDocumentSurface
        document={document}
        resourceEditorProvider={provider}
        resourceEditorHostRef={{ current: null }}
        resourceTopLine={7}
        onRevealResourceLine={onRevealResourceLine}
      >
        <div data-testid="text-surface">text</div>
      </EditorDocumentSurface>,
    );
  });

  return { onRevealResourceLine };
}

describe("EditorDocumentSurface", () => {
  it("keeps the native text surface when no resource editor owns the document", () => {
    renderSurface(documentFor("text"));
    expect(host?.querySelector('[data-testid="text-surface"]')).not.toBeNull();
  });

  it("routes binary documents to the unsupported native editor", () => {
    renderSurface(documentFor("binary"));
    expect(host?.querySelector('[data-resource-kind="binary"]')).not.toBeNull();
    expect(host?.querySelector('[data-testid="text-surface"]')).toBeNull();
  });

  it("gives a plugin resource editor precedence and preserves reveal-line wiring", () => {
    const mount = vi.fn((context: WorkbenchResourceEditorMountContext) => {
      context.container.textContent = "plugin surface";
      context.revealLine?.(12);
    });
    const provider: WorkbenchResourceEditorProvider = {
      id: "test.resource-editor",
      pluginId: "test.plugin",
      canOpen: () => true,
      mount,
    };
    const { onRevealResourceLine } = renderSurface(documentFor("binary"), provider);

    expect(host?.querySelector('[data-resource-editor-provider="test.resource-editor"]')).not.toBeNull();
    expect(host?.textContent).toContain("plugin surface");
    expect(host?.querySelector('[data-resource-kind="binary"]')).toBeNull();
    expect(mount).toHaveBeenCalledOnce();
    expect(mount.mock.calls[0]?.[0].topLine).toBe(7);
    expect(onRevealResourceLine).toHaveBeenCalledWith(12);
  });
});
