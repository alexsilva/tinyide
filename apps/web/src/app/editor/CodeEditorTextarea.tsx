import type {
  ChangeEventHandler,
  KeyboardEventHandler,
  MouseEventHandler,
  Ref,
  UIEvent,
} from "react";

interface ScrollContainerRef {
  readonly current: HTMLDivElement | null;
}

export interface CodeEditorTextareaProps {
  readonly editorRef: Ref<HTMLTextAreaElement>;
  readonly highlighted: boolean;
  readonly folded: boolean;
  readonly value: string;
  readonly readOnly: boolean | undefined;
  readonly highlightedScrollRef: ScrollContainerRef;
  readonly onChange: ChangeEventHandler<HTMLTextAreaElement>;
  readonly onKeyDown: KeyboardEventHandler<HTMLTextAreaElement>;
  readonly onMouseDown: MouseEventHandler<HTMLTextAreaElement>;
  readonly onMouseUp: MouseEventHandler<HTMLTextAreaElement>;
  readonly onDoubleClick: MouseEventHandler<HTMLTextAreaElement>;
  readonly onCaptureState: (editor: HTMLTextAreaElement, scrollContainer: HTMLElement) => void;
  readonly onNavigate: (editor: HTMLTextAreaElement) => void;
  readonly onOpenContextMenu: (
    editor: HTMLTextAreaElement,
    clientX: number,
    clientY: number,
    scrollContainer: HTMLElement,
  ) => void;
  readonly onScroll: (editor: HTMLTextAreaElement) => void;
}

export function CodeEditorTextarea({
  editorRef,
  highlighted,
  folded,
  value,
  readOnly,
  highlightedScrollRef,
  onChange,
  onKeyDown,
  onMouseDown,
  onMouseUp,
  onDoubleClick,
  onCaptureState,
  onNavigate,
  onOpenContextMenu,
  onScroll,
}: CodeEditorTextareaProps) {
  const scrollContainerFor = (editor: HTMLTextAreaElement): HTMLElement => (
    highlighted ? highlightedScrollRef.current ?? editor : editor
  );

  return (
    <textarea
      ref={editorRef}
      className={highlighted
        ? `code-editor code-editor--highlighted${folded ? " code-editor--folded" : ""}`
        : "code-editor"}
      spellCheck={false}
      {...(highlighted ? { wrap: "off" as const } : {})}
      value={value}
      readOnly={readOnly}
      onChange={onChange}
      onKeyDown={onKeyDown}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      {...(highlighted ? { onDoubleClick } : {})}
      onKeyUp={(event) => event.currentTarget.classList.toggle(
        "is-navigation-modifier",
        event.ctrlKey || event.metaKey,
      )}
      onMouseMove={(event) => event.currentTarget.classList.toggle(
        "is-navigation-modifier",
        event.ctrlKey || event.metaKey,
      )}
      onMouseLeave={(event) => event.currentTarget.classList.remove("is-navigation-modifier")}
      onSelect={(event) => onCaptureState(event.currentTarget, scrollContainerFor(event.currentTarget))}
      onClick={(event) => {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        onNavigate(event.currentTarget);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onOpenContextMenu(
          event.currentTarget,
          event.clientX,
          event.clientY,
          scrollContainerFor(event.currentTarget),
        );
      }}
      {...(!highlighted ? { onScroll: (event: UIEvent<HTMLTextAreaElement>) => onScroll(event.currentTarget) } : {})}
    />
  );
}
