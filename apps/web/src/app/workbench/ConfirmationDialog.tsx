import type { ReactNode } from "react";

export interface ConfirmationDialogProps {
  readonly titleId: string;
  readonly title: ReactNode;
  readonly children: ReactNode;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  readonly danger?: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** Shared confirmation surface used by destructive and explicit workbench actions. */
export function ConfirmationDialog({
  titleId,
  title,
  children,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  return (
    <div className="profile-removal-backdrop" role="presentation">
      <section className="profile-removal-dialog" role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
        <div>
          <span className="eyebrow">CONFIRMAÇÃO</span>
          <h3 id={titleId}>{title}</h3>
          {children}
        </div>
        <div className="dialog-actions">
          <button className="button secondary" type="button" onClick={onCancel}>{cancelLabel}</button>
          <button className={`button ${danger ? "danger" : "primary"}`} type="button" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}
