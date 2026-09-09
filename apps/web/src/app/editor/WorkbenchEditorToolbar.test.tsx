// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpenDocument } from "../../browser-filesystem";
import { WorkbenchEditorToolbar } from "./WorkbenchEditorToolbar";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

describe("WorkbenchEditorToolbar", () => {
  const sampleDoc: OpenDocument = {
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
    content: "hello",
    savedContent: "hello",
  };

  it("renders breadcrumb, navigation buttons and actions", () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    const onNavigateHistory = vi.fn();
    const onSave = vi.fn();

    act(() => {
      root?.render(
        <WorkbenchEditorToolbar
          document={sampleDoc}
          canNavigateBack={true}
          canNavigateForward={false}
          onNavigateHistory={onNavigateHistory}
          searchProps={{
            open: false,
            query: "",
            replaceOpen: false,
            replacement: "",
            caseSensitive: false,
            regex: false,
            matchCount: 0,
            matchIndex: 0,
            hasActiveMatch: false,
            canReplace: true,
            searchInputRef: { current: null },
            replaceInputRef: { current: null },
            onOpenSearch: vi.fn(),
            onCloseSearch: vi.fn(),
            onQueryChange: vi.fn(),
            onReplacementChange: vi.fn(),
            onToggleCaseSensitive: vi.fn(),
            onToggleRegex: vi.fn(),
            onToggleReplaceOpen: vi.fn(),
            onCloseReplace: vi.fn(),
            onSelectMatch: vi.fn(),
            onReplaceCurrent: vi.fn(),
            onReplaceAll: vi.fn(),
          }}
          goToLineProps={{
            open: false,
            value: "",
            lineCount: 50,
            inputRef: { current: null },
            onOpen: vi.fn(),
            onClose: vi.fn(),
            onChange: vi.fn(),
            onGoToLine: vi.fn(),
          }}
          toolbarItems={[]}
          onExecuteToolbarItem={vi.fn()}
          hasLintRules={true}
          onOpenLintSettings={vi.fn()}
          canSave={true}
          onSave={onSave}
        />,
      );
    });

    const breadcrumb = host.querySelector(".breadcrumb");
    expect(breadcrumb?.textContent).toBe("src/main.ts");

    const backBtn = host.querySelector<HTMLButtonElement>("button[aria-label='Voltar para posição anterior']");
    expect(backBtn?.disabled).toBe(false);
    act(() => backBtn?.click());
    expect(onNavigateHistory).toHaveBeenCalledWith("back");

    const forwardBtn = host.querySelector<HTMLButtonElement>("button[aria-label='Avançar para próxima posição']");
    expect(forwardBtn?.disabled).toBe(true);

    const saveBtn = host.querySelector<HTMLButtonElement>("button[aria-label='Salvar arquivo']");
    expect(saveBtn?.disabled).toBe(false);
    act(() => saveBtn?.click());
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
