import type { RefObject, ReactElement } from "react";
import type { DebugBreakpoint, TextEditorLineDecoration } from "@tinyide/plugin-api";
import { useEditorViewportLineRange, type EditorViewportStore } from "./editor-viewport";

const EDITOR_RULER_OVERSCAN_LINES = 60;
const EDITOR_RULER_STEP_LINES = 10;

function lineDecorationClassName(decorations: readonly TextEditorLineDecoration[]): string {
  const kinds = [...new Set(decorations.map((decoration) => decoration.kind))];
  return kinds.map((kind) => ` has-${kind}`).join("");
}

function editorChangeBlockKey(decoration: TextEditorLineDecoration | undefined): string | undefined {
  const after = decoration?.change?.after;
  const first = after?.[0];
  if (!after?.length || !first) return undefined;
  return `${first.line}:${after.length}:${decoration?.change?.before.length ?? 0}`;
}

export interface EditorLineRulerProps {
  readonly viewportStore: EditorViewportStore;
  readonly lineCount: number;
  readonly lineHeight: number;
  readonly contentPadding: number;
  readonly rulerRef: RefObject<HTMLPreElement | null>;
  readonly showLineNumbers: boolean;
  readonly debuggable: boolean;
  readonly documentPath: string | undefined;
  readonly fileLineByVisibleLine: readonly number[] | undefined;
  readonly breakpoints: readonly DebugBreakpoint[];
  readonly activeDebugVisibleLine: number | undefined;
  readonly decorationsByLine: ReadonlyMap<number, TextEditorLineDecoration[]>;
  readonly hoveredChangeKey: string | undefined;
  readonly onToggleBreakpoint: (fileLine: number) => void;
  readonly onChangeMarkerEnter: (decoration: TextEditorLineDecoration, changeKey: string | undefined) => void;
  readonly onChangeMarkerLeave: () => void;
  readonly onLineEnter: () => void;
}

/**
 * Régua numérica virtualizada, assinante direta do viewport. Ela se atualiza sem depender de
 * renderizações do App e concentra toda a apresentação de breakpoints/decorações por linha.
 */
export function EditorLineRuler({
  viewportStore,
  lineCount,
  lineHeight,
  contentPadding,
  rulerRef,
  showLineNumbers,
  debuggable,
  documentPath,
  fileLineByVisibleLine,
  breakpoints,
  activeDebugVisibleLine,
  decorationsByLine,
  hoveredChangeKey,
  onToggleBreakpoint,
  onChangeMarkerEnter,
  onChangeMarkerLeave,
  onLineEnter,
}: EditorLineRulerProps) {
  const range = useEditorViewportLineRange(
    viewportStore,
    lineCount,
    EDITOR_RULER_OVERSCAN_LINES,
    lineHeight,
    contentPadding,
    EDITOR_RULER_STEP_LINES,
  );
  const editorLineTop = (line: number) => contentPadding + (line - 1) * lineHeight;
  const lines: ReactElement[] = [];
  for (let line = range.start; line <= range.end; line += 1) {
    const fileLine = fileLineByVisibleLine?.[line - 1] ?? line;
    const breakpoint = documentPath
      ? breakpoints.find((candidate) => candidate.path === documentPath && candidate.line === fileLine)
      : undefined;
    const currentDebugLine = activeDebugVisibleLine === line;
    const decorations = decorationsByLine.get(line) ?? [];
    const changeDecoration = decorations.find((decoration) => decoration.change);
    const changeKey = editorChangeBlockKey(changeDecoration);
    const tooltip = decorations
      .map((decoration) => decoration.tooltip ?? decoration.label)
      .filter((value): value is string => Boolean(value))
      .join("\n");
    const content = <>
      <i
        className="editor-line-ruler__marker"
        onMouseEnter={changeDecoration
          ? () => onChangeMarkerEnter(changeDecoration, changeKey)
          : undefined}
        onMouseLeave={changeDecoration ? onChangeMarkerLeave : undefined}
      />
      <i className={`editor-line-ruler__breakpoint${breakpoint ? " is-active" : ""}`} />
      <i className={`editor-line-ruler__execution-marker${currentDebugLine ? " is-current" : ""}`} />
      {showLineNumbers ? <b>{fileLine}</b> : null}
    </>;
    const ariaLabel = debuggable
      ? changeDecoration
        ? `${breakpoint ? "Remover" : "Adicionar"} breakpoint na linha ${fileLine} (alteração: ${tooltip || "Exibir alteração"})`
        : `${breakpoint ? "Remover" : "Adicionar"} breakpoint na linha ${fileLine}`
      : changeDecoration
        ? `Linha ${fileLine} (alteração: ${tooltip || "Exibir alteração"})`
        : `Linha ${fileLine}`;
    lines.push(
      <button
        className={`editor-line-ruler__line${lineDecorationClassName(decorations)}${changeKey && changeKey === hoveredChangeKey ? " is-change-hover" : ""}${currentDebugLine ? " is-debug-current" : ""}${breakpoint ? " has-breakpoint" : ""}`}
        key={line}
        style={{ top: `${editorLineTop(line)}px` }}
        type="button"
        title={changeDecoration ? tooltip || undefined : undefined}
        aria-label={ariaLabel}
        onClick={() => onToggleBreakpoint(fileLine)}
        onMouseEnter={onLineEnter}
      >
        {content}
      </button>,
    );
  }
  return (
    <div className={`editor-line-ruler${showLineNumbers ? "" : " decorations-only"}${debuggable ? " is-debuggable" : ""}`}>
      <pre
        ref={rulerRef}
        style={{ height: `${contentPadding * 2 + lineCount * lineHeight}px` }}
      >
        {lines}
      </pre>
    </div>
  );
}
