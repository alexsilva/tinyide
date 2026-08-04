import * as Tooltip from "@radix-ui/react-tooltip";
import { CircleAlert, Code2, MoreVertical, Undo2, X } from "lucide-react";
import { memo, useMemo, type CSSProperties, type ReactNode } from "react";
import type { TextDiagnostic, TextEditorLineDecoration } from "@tinyide/plugin-api";
import type { SyntaxHighlighter } from "../generic-syntax";

export const HighlightedSource = memo(function HighlightedSource({
  source,
  provider,
  highlight,
}: {
  readonly source: string;
  readonly provider?: Pick<SyntaxHighlighter, "highlight">;
  readonly highlight?: { readonly start: number; readonly end: number };
}) {
  const tokens = useMemo(() => [...(provider?.highlight(source) ?? [])]
    .filter((token) => token.start >= 0 && token.start < token.end && token.end <= source.length)
    .sort((left, right) => left.start - right.start), [provider, source]);
  const highlightStart = Math.max(0, Math.min(source.length, highlight?.start ?? 0));
  const highlightEnd = Math.max(highlightStart, Math.min(source.length, highlight?.end ?? 0));
  const boundaries = new Set([0, source.length]);
  tokens.forEach((token) => {
    boundaries.add(token.start);
    boundaries.add(token.end);
  });
  if (highlightEnd > highlightStart) {
    boundaries.add(highlightStart);
    boundaries.add(highlightEnd);
  }
  const offsets = [...boundaries].sort((left, right) => left - right);
  const fragments: ReactNode[] = [];
  let tokenIndex = 0;
  for (let index = 0; index < offsets.length - 1; index += 1) {
    const start = offsets[index] ?? 0;
    const end = offsets[index + 1] ?? start;
    if (end <= start) continue;
    while (tokenIndex < tokens.length && (tokens[tokenIndex]?.end ?? Number.POSITIVE_INFINITY) <= start) tokenIndex += 1;
    const token = tokens[tokenIndex];
    const classes = [
      token && token.start <= start && token.end >= end ? `syntax-${token.scope}` : undefined,
      start >= highlightStart && end <= highlightEnd && highlightEnd > highlightStart
        ? "editor-search-match"
        : undefined,
    ].filter(Boolean).join(" ");
    const content = source.slice(start, end);
    fragments.push(classes
      ? <span className={classes} key={`${start}:${end}`}>{content}</span>
      : content);
  }
  fragments.push("\n");
  return <>{fragments}</>;
});

export function HighlightedLine({ source, provider }: { readonly source: string; readonly provider: Pick<SyntaxHighlighter, "highlight"> | undefined }) {
  if (!provider) return <>{source}</>;
  const tokens = [...provider.highlight(source)].sort((left, right) => left.start - right.start);
  const fragments: ReactNode[] = [];
  let cursor = 0;
  for (const token of tokens) {
    if (token.start < cursor || token.start < 0 || token.end > source.length) continue;
    if (token.start > cursor) fragments.push(source.slice(cursor, token.start));
    fragments.push(<span className={`syntax-${token.scope}`} key={`${token.start}:${token.end}`}>{source.slice(token.start, token.end)}</span>);
    cursor = token.end;
  }
  if (cursor < source.length) fragments.push(source.slice(cursor));
  return <>{fragments}</>;
}

export function EditorLineDiffPeek({
  decoration,
  provider,
  top,
  onClose,
  onAction,
}: {
  readonly decoration: TextEditorLineDecoration;
  readonly provider: Pick<SyntaxHighlighter, "highlight"> | undefined;
  readonly top: number;
  readonly onClose: () => void;
  readonly onAction: (action: NonNullable<TextEditorLineDecoration["actions"]>[number]) => void;
}) {
  const change = decoration.change;
  if (!change) return null;
  const allLines = [...change.before, ...change.after].map((line) => line.line);
  const width = Math.max(2, String(Math.max(1, ...allLines)).length);
  const rows = [
    ...change.before.map((line) => ({ ...line, kind: "before" as const, marker: "−" })),
    ...change.after.map((line) => ({ ...line, kind: "after" as const, marker: "+" })),
  ];
  return (
    <section
      className="editor-line-diff-peek"
      aria-label={`Diferença da linha ${decoration.line}`}
      style={{ "--editor-line-diff-top": `${top}px` } as CSSProperties}
    >
      <div className="editor-line-diff-peek__heading">
        <div>
          <span className={`editor-line-diff-peek__status is-${decoration.kind}`} />
          <strong>{decoration.label ?? decoration.tooltip ?? `Alteração na linha ${decoration.line}`}</strong>
        </div>
        <div className="editor-line-diff-peek__actions">
          {decoration.actions?.map((action) => {
            const ActionIcon = action.id.includes("revert")
              ? Undo2
              : action.id.includes("diff")
                ? Code2
                : MoreVertical;
            return (
              <button
                className="icon-button small editor-line-diff-peek__action"
                key={action.id}
                type="button"
                title={action.title ?? action.label}
                aria-label={action.label}
                onClick={() => onAction(action)}
              >
                <ActionIcon size={14} />
              </button>
            );
          })}
          <button
            className="icon-button small editor-line-diff-peek__action"
            type="button"
            title="Fechar"
            aria-label="Fechar diff da linha"
            onClick={onClose}
          ><X size={14} /></button>
        </div>
      </div>
      <div className="editor-line-diff-peek__code">
        {rows.length ? rows.map((line, index) => (
          <div className={`editor-line-diff-peek__row is-${line.kind}`} key={`${line.kind}:${line.line}:${index}`}>
            <span className="editor-line-diff-peek__marker">{line.marker}</span>
            <span className="editor-line-diff-peek__line-number">{String(line.line).padStart(width, "0")}</span>
            <pre><HighlightedLine source={line.content} provider={provider} /></pre>
          </div>
        )) : <div className="editor-line-diff-peek__empty">Alteração sem conteúdo textual.</div>}
      </div>
    </section>
  );
}

export function DiagnosticLayer({
  diagnostics,
  source,
  hoveredLine,
}: {
  readonly diagnostics: readonly TextDiagnostic[];
  readonly source: string;
  readonly hoveredLine: number | undefined;
}) {
  const sourceLines = source.split(/\r?\n/);
  const diagnosticsByLine = new Map<number, TextDiagnostic[]>();
  diagnostics.forEach((diagnostic) => {
    const current = diagnosticsByLine.get(diagnostic.line) ?? [];
    current.push(diagnostic);
    diagnosticsByLine.set(diagnostic.line, current);
  });

  return (
    <div className="diagnostic-layer">
      {[...diagnosticsByLine.entries()].map(([line, lineDiagnostics]) => {
        const severity = lineDiagnostics.some((diagnostic) => diagnostic.severity === "error")
          ? "error"
          : lineDiagnostics.some((diagnostic) => diagnostic.severity === "warning")
            ? "warning"
            : "information";
        const lineLength = sourceLines[line - 1]?.length ?? 0;
        return (
          <div
            className={`diagnostic-line diagnostic-line--${severity}${hoveredLine === line ? " is-hovered" : ""}`}
            key={line}
            style={{
              "--diagnostic-line": line,
              "--diagnostic-line-length": lineLength,
            } as CSSProperties}
            aria-hidden={hoveredLine === line ? undefined : true}
          >
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  className="diagnostic-line__details"
                  type="button"
                  aria-label={`Detalhes dos problemas na linha ${line}`}
                >
                  <CircleAlert size={14} />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content className="tooltip diagnostic-tooltip" side="right" sideOffset={7}>
                  {lineDiagnostics.map((diagnostic, index) => (
                    <span key={`${diagnostic.column}:${diagnostic.code ?? index}`}>
                      <strong>{diagnostic.line}:{diagnostic.column}</strong>
                      {diagnostic.message}
                    </span>
                  ))}
                  <Tooltip.Arrow className="tooltip-arrow" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </div>
        );
      })}
    </div>
  );
}
