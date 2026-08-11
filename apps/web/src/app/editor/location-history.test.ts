import { describe, expect, it } from "vitest";
import {
  createEditorLocationHistory,
  navigateEditorLocationBack,
  navigateEditorLocationForward,
  recordEditorLocation,
  type EditorLocation,
} from "./location-history";

function location(documentId: string, selectionStart = 0): EditorLocation {
  return {
    documentId,
    path: `${documentId}.ts`,
    line: 1,
    column: selectionStart + 1,
    endLine: 1,
    endColumn: selectionStart + 1,
    selectionStart,
    selectionEnd: selectionStart,
    scrollTop: selectionStart * 10,
    scrollLeft: 0,
  };
}

describe("editor location history", () => {
  it("returns through chained definition jumps and supports forward navigation", () => {
    let history = createEditorLocationHistory();
    history = recordEditorLocation(history, location("A", 1));
    history = recordEditorLocation(history, location("B", 2));

    const fromC = navigateEditorLocationBack(history, location("C", 3));
    expect(fromC.location).toEqual(location("B", 2));
    const fromB = navigateEditorLocationBack(fromC.history, location("B", 2));
    expect(fromB.location).toEqual(location("A", 1));

    const forwardToB = navigateEditorLocationForward(fromB.history, location("A", 1));
    expect(forwardToB.location).toEqual(location("B", 2));
    const forwardToC = navigateEditorLocationForward(forwardToB.history, location("B", 2));
    expect(forwardToC.location).toEqual(location("C", 3));
  });

  it("clears forward history after a new jump", () => {
    let history = recordEditorLocation(createEditorLocationHistory(), location("A"));
    history = recordEditorLocation(history, location("B"));
    const back = navigateEditorLocationBack(history, location("C"));

    const divergent = recordEditorLocation(back.history, location("B", 9));
    expect(divergent.forward).toEqual([]);
    expect(divergent.back.at(-1)).toEqual(location("B", 9));
  });

  it("does not duplicate the same origin consecutively", () => {
    const once = recordEditorLocation(createEditorLocationHistory(), location("A"));
    const twice = recordEditorLocation(once, location("A"));
    expect(twice.back).toHaveLength(1);
  });
});
