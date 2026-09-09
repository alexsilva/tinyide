import type { PointerEventHandler } from "react";
import type { TextDiagnostic } from "@tinyide/plugin-api";
import type { ActivityBarSide } from "../activity-layout";
import { ProblemsPanel } from "./ProblemsPanel";

export interface WorkbenchProblemsDockProps {
  readonly visible: boolean;
  readonly side: ActivityBarSide;
  readonly diagnostics: readonly TextDiagnostic[];
  readonly onResize: PointerEventHandler<HTMLDivElement>;
  readonly onResetWidth: () => void;
  readonly onClose: () => void;
}

export function WorkbenchProblemsDock({
  visible,
  side,
  diagnostics,
  onResize,
  onResetWidth,
  onClose,
}: WorkbenchProblemsDockProps) {
  if (!visible) return null;

  return (
    <>
      <div
        className={`resize-handle ${side === "left" ? "resize-handle--sidebar" : "resize-handle--problems"}`}
        role="separator"
        aria-label="Redimensionar painel de problemas"
        onPointerDown={onResize}
        onDoubleClick={onResetWidth}
      />
      <ProblemsPanel side={side} diagnostics={diagnostics} onClose={onClose} />
    </>
  );
}
