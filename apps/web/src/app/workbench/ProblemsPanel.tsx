import { X } from "lucide-react";
import type { TextDiagnostic } from "@tinyide/plugin-api";
import type { ActivityBarSide } from "../activity-layout";

export function ProblemsPanel({
  side,
  diagnostics,
  onClose,
}: {
  readonly side: ActivityBarSide;
  readonly diagnostics: readonly TextDiagnostic[];
  readonly onClose: () => void;
}) {
  return (
    <aside
      className={`problems-panel problems-panel--${side}`}
      style={{ gridColumn: side === "left" ? 2 : 6 }}
      aria-label="Problemas"
    >
      <div className="problems-panel__heading">
        <span>PROBLEMAS <b>{diagnostics.length}</b></span>
        <button className="icon-button small" type="button" aria-label="Fechar problemas" onClick={onClose}><X size={14} /></button>
      </div>
      <div className="problems-list problems-list--vertical">
        {diagnostics.length ? diagnostics.map((diagnostic, index) => (
          <button type="button" key={`${diagnostic.line}:${index}`}>
            <strong>{diagnostic.severity}</strong>
            <span>{diagnostic.line}:{diagnostic.column}</span>
            <span>{diagnostic.message}</span>
          </button>
        )) : <p>Nenhum problema detectado.</p>}
      </div>
    </aside>
  );
}
