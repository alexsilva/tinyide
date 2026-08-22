import type { CompletionSession } from "./completion-session";

export interface CompletionPopupProps {
  readonly session: CompletionSession;
  readonly onSelect: (index: number) => void;
  readonly onCommit: (index: number) => void;
}

export function CompletionPopup({ session, onSelect, onCommit }: CompletionPopupProps) {
  return (
    <div
      className="editor-completion-popup"
      style={{ top: session.top, left: session.left }}
      role="listbox"
      aria-label="Sugestões de autocomplete"
    >
      {session.items.map((item, index) => (
        <button
          key={`${item.label}:${index}`}
          className={`editor-completion-item${index === session.selectedIndex ? " is-selected" : ""}`}
          type="button"
          role="option"
          aria-selected={index === session.selectedIndex}
          onMouseEnter={() => onSelect(index)}
          onMouseDown={(event) => {
            event.preventDefault();
            onCommit(index);
          }}
        >
          <span className={`editor-completion-kind is-${item.kind ?? "text"}`}>{item.kind ?? "text"}</span>
          <span className="editor-completion-label">{item.label}</span>
          {item.detail ? <span className="editor-completion-detail">{item.detail}</span> : null}
        </button>
      ))}
    </div>
  );
}
