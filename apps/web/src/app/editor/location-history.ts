export interface EditorLocation {
  readonly documentId: string;
  readonly path?: string;
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
  readonly selectionStart: number;
  readonly selectionEnd: number;
  readonly scrollTop: number;
  readonly scrollLeft: number;
}

export interface EditorLocationHistory {
  readonly back: readonly EditorLocation[];
  readonly forward: readonly EditorLocation[];
}

export interface EditorLocationHistoryNavigation {
  readonly history: EditorLocationHistory;
  readonly location?: EditorLocation;
}

const HISTORY_LIMIT = 100;

export function createEditorLocationHistory(): EditorLocationHistory {
  return { back: [], forward: [] };
}

export function recordEditorLocation(
  history: EditorLocationHistory,
  location: EditorLocation,
): EditorLocationHistory {
  const previous = history.back.at(-1);
  const back = previous && locationsEqual(previous, location)
    ? history.back
    : [...history.back, location].slice(-HISTORY_LIMIT);
  return { back, forward: [] };
}

export function navigateEditorLocationBack(
  history: EditorLocationHistory,
  current: EditorLocation,
): EditorLocationHistoryNavigation {
  const location = history.back.at(-1);
  if (!location) return { history };
  return {
    location,
    history: {
      back: history.back.slice(0, -1),
      forward: [current, ...history.forward].slice(0, HISTORY_LIMIT),
    },
  };
}

export function navigateEditorLocationForward(
  history: EditorLocationHistory,
  current: EditorLocation,
): EditorLocationHistoryNavigation {
  const location = history.forward[0];
  if (!location) return { history };
  return {
    location,
    history: {
      back: [...history.back, current].slice(-HISTORY_LIMIT),
      forward: history.forward.slice(1),
    },
  };
}

function locationsEqual(left: EditorLocation, right: EditorLocation): boolean {
  return left.documentId === right.documentId
    && left.selectionStart === right.selectionStart
    && left.selectionEnd === right.selectionEnd
    && left.scrollTop === right.scrollTop
    && left.scrollLeft === right.scrollLeft;
}
