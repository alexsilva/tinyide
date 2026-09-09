import { ExternalLink, X } from "lucide-react";
import type { PointerEventHandler, ReactNode } from "react";
import type { ActivityBarSide } from "../activity-layout";

export interface WorkbenchSidebarProps {
  readonly side: ActivityBarSide;
  readonly label: string;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly detachLabel?: string;
  readonly onDetach?: () => void;
  readonly onClose: () => void;
  readonly onResize: PointerEventHandler<HTMLDivElement>;
  readonly onResetWidth: () => void;
}

/** Moldura comum aos painéis laterais; cada recurso fornece ações e conteúdo. */
export function WorkbenchSidebar({
  side, label, actions, children, detachLabel, onDetach, onClose, onResize, onResetWidth,
}: WorkbenchSidebarProps) {
  return (
    <>
      <aside className={`sidebar sidebar--${side}`} style={{ gridColumn: side === "left" ? 2 : 6 }}>
        <div className="sidebar-heading">
          <span>{label}</span>
          <div className="sidebar-heading-actions">
            {actions}
            {onDetach ? (
              <button
                className="icon-button small"
                type="button"
                aria-label={`Abrir ${detachLabel ?? label} em janela separada`}
                title="Abrir em janela separada"
                onClick={onDetach}
              ><ExternalLink size={14} /></button>
            ) : null}
            <button className="icon-button small" type="button" onClick={onClose} aria-label="Fechar sidebar"><X size={14} /></button>
          </div>
        </div>
        {children}
      </aside>
      <div
        className={`resize-handle ${side === "left" ? "resize-handle--sidebar" : "resize-handle--problems"}`}
        role="separator"
        aria-label="Redimensionar painel lateral"
        onPointerDown={onResize}
        onDoubleClick={onResetWidth}
      />
    </>
  );
}
