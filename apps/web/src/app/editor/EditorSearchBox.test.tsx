// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorSearchBox } from "./EditorSearchBox";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

describe("EditorSearchBox", () => {
  it("renders closed button and triggers open", () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    const onOpen = vi.fn();

    act(() => {
      root?.render(
        <EditorSearchBox
          open={false}
          query=""
          replaceOpen={false}
          replacement=""
          caseSensitive={false}
          regex={false}
          matchCount={0}
          matchIndex={0}
          hasActiveMatch={false}
          canReplace={true}
          searchInputRef={{ current: null }}
          replaceInputRef={{ current: null }}
          onOpenSearch={onOpen}
          onCloseSearch={vi.fn()}
          onQueryChange={vi.fn()}
          onReplacementChange={vi.fn()}
          onToggleCaseSensitive={vi.fn()}
          onToggleRegex={vi.fn()}
          onToggleReplaceOpen={vi.fn()}
          onCloseReplace={vi.fn()}
          onSelectMatch={vi.fn()}
          onReplaceCurrent={vi.fn()}
          onReplaceAll={vi.fn()}
        />,
      );
    });

    const button = host.querySelector<HTMLButtonElement>("button");
    expect(button).not.toBeNull();
    expect(button?.getAttribute("aria-label")).toBe("Pesquisar no arquivo");
    act(() => button?.click());
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("renders open search widget and responds to toggles", () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    const onToggleCase = vi.fn();
    const onToggleRegex = vi.fn();

    act(() => {
      root?.render(
        <EditorSearchBox
          open={true}
          query="test"
          replaceOpen={false}
          replacement=""
          caseSensitive={false}
          regex={false}
          matchCount={3}
          matchIndex={1}
          hasActiveMatch={true}
          canReplace={true}
          searchInputRef={{ current: null }}
          replaceInputRef={{ current: null }}
          onOpenSearch={vi.fn()}
          onCloseSearch={vi.fn()}
          onQueryChange={vi.fn()}
          onReplacementChange={vi.fn()}
          onToggleCaseSensitive={onToggleCase}
          onToggleRegex={onToggleRegex}
          onToggleReplaceOpen={vi.fn()}
          onCloseReplace={vi.fn()}
          onSelectMatch={vi.fn()}
          onReplaceCurrent={vi.fn()}
          onReplaceAll={vi.fn()}
        />,
      );
    });

    const searchContainer = host.querySelector(".editor-search");
    expect(searchContainer).not.toBeNull();

    const count = host.querySelector(".editor-search__count");
    expect(count?.textContent).toBe("2/3");

    const toggles = host.querySelectorAll<HTMLButtonElement>(".editor-search__toggle");
    expect(toggles.length).toBe(2);

    act(() => toggles[0]?.click());
    expect(onToggleCase).toHaveBeenCalledTimes(1);

    act(() => toggles[1]?.click());
    expect(onToggleRegex).toHaveBeenCalledTimes(1);
  });
});
