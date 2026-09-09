// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenDocument } from "../../browser-filesystem";
import { WorkbenchEditorTabs } from "./WorkbenchEditorTabs";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

describe("WorkbenchEditorTabs", () => {
  const sampleDocs: OpenDocument[] = [
    {
      id: "doc-1",
      name: "main.ts",
      path: "src/main.ts",
      kind: "text",
      mediaType: "text/plain",
      size: 0,
      selectionStart: 0,
      selectionEnd: 0,
      scrollTop: 0,
      scrollLeft: 0,
      content: "console.log('hello')",
      savedContent: "console.log('hello')",
    },
    {
      id: "doc-2",
      name: "README.md",
      path: "README.md",
      kind: "text",
      mediaType: "text/plain",
      size: 0,
      selectionStart: 0,
      selectionEnd: 0,
      scrollTop: 0,
      scrollLeft: 0,
      content: "# Modified",
      savedContent: "# Initial",
    },
  ];

  it("renders open documents and indicates modified state", () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    const onSelect = vi.fn();
    const onClose = vi.fn();
    const onReorder = vi.fn();
    const onContextMenu = vi.fn();
    const onDragStateChange = vi.fn();

    act(() => {
      root?.render(
        <WorkbenchEditorTabs
          documents={sampleDocs}
          activeDocumentId="doc-1"
          onSelectDocument={onSelect}
          onCloseDocument={onClose}
          onReorderDocuments={onReorder}
          onOpenContextMenu={onContextMenu}
          onDragStateChange={onDragStateChange}
        />,
      );
    });

    const triggers = host.querySelectorAll(".tab-trigger");
    expect(triggers.length).toBe(2);
    expect(triggers[0]?.textContent).toContain("main.ts");
    expect(triggers[1]?.textContent).toContain("README.md");

    // README.md is dirty, so it should contain the dirty-dot
    const dirtyDot = triggers[1]?.querySelector(".dirty-dot");
    expect(dirtyDot).not.toBeNull();

    // Clicking close on doc-1
    const closeBtn = triggers[0]?.querySelector<HTMLSpanElement>(".tab-close");
    expect(closeBtn).not.toBeNull();
    act(() => closeBtn?.click());
    expect(onClose).toHaveBeenCalledWith("doc-1");
  });
});
