import type { CSSProperties, Ref } from "react";
import { RefreshCw } from "lucide-react";
import type { SyntaxHighlighter } from "../generic-syntax";
import { HighlightedSource } from "./editor-components";

export interface EditorFoldControl {
  readonly line: number;
  readonly folded: boolean;
}

export function EditorFoldOverlay({
  controls,
  inline,
  scrollTop,
  overlayRef,
  lineTop,
  onOpenPreview,
  onSchedulePreviewClose,
  onToggleFold,
}: {
  readonly controls: readonly EditorFoldControl[];
  readonly inline: boolean;
  readonly scrollTop: number;
  readonly overlayRef: Ref<HTMLDivElement>;
  readonly lineTop: (line: number) => number;
  readonly onOpenPreview: (line: number) => void;
  readonly onSchedulePreviewClose: () => void;
  readonly onToggleFold: (line: number) => void;
}) {
  if (!controls.length) return null;
  return (
    <div
      ref={overlayRef}
      className={`editor-fold-overlay${inline ? " editor-fold-overlay--inline" : ""}`}
      style={inline ? undefined : { "--editor-scroll-top": `${scrollTop}px` } as CSSProperties}
    >
      {controls.map(({ line, folded }) => (
        <button
          key={line}
          className={`editor-fold-toggle${folded ? " is-folded" : ""}`}
          type="button"
          title={folded ? "Expandir bloco" : "Recolher bloco"}
          aria-label={folded ? `Expandir bloco, linha ${line}` : `Recolher bloco, linha ${line}`}
          style={{ "--fold-line-top": `${lineTop(line)}px` } as CSSProperties}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => { if (folded) onOpenPreview(line); else onSchedulePreviewClose(); }}
          onFocus={() => { if (folded) onOpenPreview(line); else onSchedulePreviewClose(); }}
          onMouseLeave={(event) => {
            if (event.relatedTarget instanceof Element && event.relatedTarget.closest(".editor-fold-preview")) return;
            onSchedulePreviewClose();
          }}
          onBlur={(event) => {
            if (event.relatedTarget instanceof Element && event.relatedTarget.closest(".editor-fold-preview")) return;
            onSchedulePreviewClose();
          }}
          onClick={() => onToggleFold(line)}
        >{folded ? "+" : "-"}</button>
      ))}
    </div>
  );
}

export function EditorExecutionLayers({
  breakpointLines,
  activeDebugLine,
  activeDebugVisibleLine,
  attentionLines,
  inline,
  scrollTop,
  lineHeight,
  lineTop,
  breakpointLinesRef,
  debugCurrentLineRef,
}: {
  readonly breakpointLines: readonly number[];
  readonly activeDebugLine?: number;
  readonly activeDebugVisibleLine?: number;
  readonly attentionLines?: { readonly startLine: number; readonly endLine: number };
  readonly inline: boolean;
  readonly scrollTop: number;
  readonly lineHeight: number;
  readonly lineTop: (line: number) => number;
  readonly breakpointLinesRef: Ref<HTMLDivElement>;
  readonly debugCurrentLineRef: Ref<HTMLDivElement>;
}) {
  const scrolledLayerStyle = inline
    ? undefined
    : { "--editor-scroll-top": `${scrollTop}px` } as CSSProperties;
  return (
    <>
      {breakpointLines.length ? (
        <div
          ref={breakpointLinesRef}
          className={`editor-breakpoint-lines${inline ? " editor-breakpoint-lines--inline" : ""}`}
          aria-hidden="true"
          style={scrolledLayerStyle}
        >
          {breakpointLines.map((line) => (
            <div
              key={line}
              className="editor-breakpoint-line"
              style={{ "--breakpoint-line-top": `${lineTop(line)}px` } as CSSProperties}
            />
          ))}
        </div>
      ) : null}
      {activeDebugLine && activeDebugVisibleLine ? (
        <div
          ref={debugCurrentLineRef}
          className={`editor-debug-current-line${inline ? " editor-debug-current-line--inline" : ""}`}
          aria-hidden="true"
          data-debug-line={activeDebugLine}
          data-debug-visible-line={activeDebugVisibleLine}
          style={{
            "--debug-line-content-top": `${lineTop(activeDebugVisibleLine)}px`,
            ...(inline ? {} : { "--editor-scroll-top": `${scrollTop}px` }),
          } as CSSProperties}
        />
      ) : null}
      {attentionLines ? (
        <div
          className={`editor-attention-lines${inline ? " editor-attention-lines--inline" : ""}`}
          aria-hidden="true"
          data-attention-start-line={attentionLines.startLine}
          data-attention-end-line={attentionLines.endLine}
          style={{
            "--attention-line-content-top": `${lineTop(attentionLines.startLine)}px`,
            "--attention-line-height": `${(attentionLines.endLine - attentionLines.startLine + 1) * lineHeight}px`,
            ...(inline ? {} : { "--editor-scroll-top": `${scrollTop}px` }),
          } as CSSProperties}
        />
      ) : null}
    </>
  );
}

export function EditorOperationMask({ label }: { readonly label: string | undefined }) {
  if (label === undefined) return null;
  return (
    <div className="editor-operation-mask" role="status" aria-live="polite">
      <RefreshCw className="is-spinning" size={18} />
      <span>{label}</span>
    </div>
  );
}

export function EditorFoldPreview({
  text,
  lineCount,
  top,
  maxHeight,
  provider,
  onCancelClose,
  onScheduleClose,
}: {
  readonly text: string;
  readonly lineCount: number;
  readonly top: number;
  readonly maxHeight: number;
  readonly provider?: SyntaxHighlighter;
  readonly onCancelClose: () => void;
  readonly onScheduleClose: () => void;
}) {
  return (
    <div
      className="editor-fold-preview"
      style={{
        "--fold-preview-top": `${top}px`,
        "--fold-preview-max-height": `${maxHeight}px`,
      } as CSSProperties}
      role="tooltip"
      onMouseMove={(event) => event.stopPropagation()}
      onMouseEnter={onCancelClose}
      onMouseLeave={onScheduleClose}
      onFocus={onCancelClose}
      onBlur={(event) => {
        if (event.relatedTarget instanceof Element && event.relatedTarget.closest(".editor-fold-toggle.is-folded")) return;
        onScheduleClose();
      }}
      onWheel={(event) => event.stopPropagation()}
    >
      <div className="editor-fold-preview__title">
        <span>Trecho recolhido</span>
        <span>{lineCount} linha(s)</span>
      </div>
      <pre tabIndex={0} aria-label="Conteúdo completo do trecho recolhido">
        <HighlightedSource source={text} {...(provider ? { provider } : {})} />
      </pre>
      {lineCount > 12 ? (
        <div className="editor-fold-preview__footer">Role para visualizar o trecho completo.</div>
      ) : null}
    </div>
  );
}
