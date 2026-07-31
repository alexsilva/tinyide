export const TEXT_CONTEXT_MENU_EVENT = "tinyide:text-context-menu";

export interface TextContextMenuDetail {
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

interface TextControlSelection {
  readonly value: string;
  readonly selectionStart: number | null;
  readonly selectionEnd: number | null;
}

function isTextControlSelection(target: EventTarget | null): target is EventTarget & TextControlSelection {
  if (!target || typeof target !== "object") return false;
  const candidate = target as Partial<TextControlSelection>;
  return typeof candidate.value === "string"
    && (typeof candidate.selectionStart === "number" || candidate.selectionStart === null)
    && (typeof candidate.selectionEnd === "number" || candidate.selectionEnd === null);
}

export function selectedTextAtTarget(
  target: EventTarget | null,
  documentSelection: Selection | null,
): string {
  if (isTextControlSelection(target)) {
    const start = target.selectionStart;
    const end = target.selectionEnd;
    return start !== null && end !== null && end > start
      ? target.value.slice(start, end)
      : "";
  }
  return documentSelection?.toString() ?? "";
}

export function requestTextContextMenu(detail: TextContextMenuDetail): void {
  document.dispatchEvent(new CustomEvent<TextContextMenuDetail>(TEXT_CONTEXT_MENU_EVENT, { detail }));
}
