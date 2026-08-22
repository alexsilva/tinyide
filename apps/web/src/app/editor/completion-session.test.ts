import { beforeAll, describe, expect, it } from "vitest";
import {
  refineCompletionSession,
  shouldAutoRequestCompletion,
  type CompletionSession,
} from "./completion-session";

beforeAll(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      getComputedStyle: () => ({
        lineHeight: "21px",
        fontSize: "13px",
        paddingTop: "0px",
        paddingLeft: "0px",
      }),
    },
  });
});

function textarea(value: string, caret = value.length): HTMLTextAreaElement {
  return {
    value,
    selectionStart: caret,
    selectionEnd: caret,
    scrollTop: 0,
    scrollLeft: 0,
    getBoundingClientRect: () => ({ top: 0, left: 0 }),
  } as unknown as HTMLTextAreaElement;
}

function session(prefix: string, items: CompletionSession["items"]): CompletionSession {
  return {
    prefix,
    items,
    selectedIndex: 0,
    replaceStart: 0,
    replaceEnd: prefix.length,
    top: 0,
    left: 0,
  };
}

describe("completion session performance guards", () => {
  it("does not schedule semantic completion for tiny prefixes", () => {
    expect(shouldAutoRequestCompletion(textarea("a"), 3)).toBe(false);
    expect(shouldAutoRequestCompletion(textarea("ab"), 3)).toBe(false);
    expect(shouldAutoRequestCompletion(textarea("abc"), 3)).toBe(true);
  });

  it("filters an existing completion list locally while the same identifier grows", () => {
    const editor = textarea("dumps");
    const refined = refineCompletionSession(editor, session("du", [
      { label: "dump", kind: "function" },
      { label: "dumps", kind: "function" },
      { label: "load", kind: "function" },
    ]));
    expect(refined?.prefix).toBe("dumps");
    expect(refined?.items.map((item) => item.label)).toEqual(["dumps"]);
    expect(refined?.replaceEnd).toBe(5);
  });

  it("does not reuse a list after the user starts another identifier", () => {
    const editor = textarea("other");
    expect(refineCompletionSession(editor, session("du", [{ label: "dump" }]))).toBeUndefined();
  });
});
