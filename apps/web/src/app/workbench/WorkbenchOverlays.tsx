import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { Dispatch, Ref, SetStateAction } from "react";
import type {
  ResourceContextMenuItem,
  WorkbenchConfirmRequest,
  WorkbenchDialogContribution,
} from "@tinyide/plugin-api";
import { WorkbenchDialogHost } from "../workbench-dialog-host";
import { ConfirmationDialog } from "./ConfirmationDialog";
import {
  WorkbenchContextMenuHost,
  type WorkbenchContextMenuHandle,
} from "./WorkbenchContextMenuHost";
import type { WorkbenchContextMenuTarget } from "./context-menu";

export interface ActiveWorkbenchDialog {
  readonly token: symbol;
  readonly contribution: WorkbenchDialogContribution;
  readonly size?: WorkbenchDialogContribution["size"];
}

export function WorkbenchPluginDialog({
  dialog,
  onChange,
}: {
  readonly dialog: ActiveWorkbenchDialog | undefined;
  readonly onChange: Dispatch<SetStateAction<ActiveWorkbenchDialog | undefined>>;
}) {
  const requestClose = () => {
    const shouldClose = dialog?.contribution.onCloseRequest?.() !== false;
    if (shouldClose) onChange(undefined);
  };

  return (
    <Dialog.Root open={Boolean(dialog)} onOpenChange={(open) => { if (!open) requestClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className={`workbench-plugin-dialog workbench-plugin-dialog--${dialog?.size ?? dialog?.contribution.size ?? "large"}`}>
          <div className="dialog-heading">
            <div>
              {dialog?.contribution.showPluginLabel === false ? null : <span className="eyebrow">PLUGIN</span>}
              <Dialog.Title>{dialog?.contribution.title ?? "Plugin"}</Dialog.Title>
              {dialog?.contribution.description ? <Dialog.Description>{dialog.contribution.description}</Dialog.Description> : null}
            </div>
            <Dialog.Close asChild>
              <button className="icon-button" type="button" aria-label="Fechar"><X size={16} /></button>
            </Dialog.Close>
          </div>
          {dialog ? (
            <WorkbenchDialogHost
              provider={dialog.contribution}
              onClose={() => onChange(undefined)}
              onSizeChange={(size) => onChange((current) => (
                current?.token === dialog.token ? { ...current, size } : current
              ))}
            />
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function DismissibleErrorToast({
  message,
  source,
  dismissLabel = "Fechar erro",
  onDismiss,
}: {
  readonly message: string | undefined;
  readonly source?: string;
  readonly dismissLabel?: string;
  readonly onDismiss: () => void;
}) {
  if (!message) return null;
  return (
    <div className="error-toast" role="alert" {...(source ? { "data-source": source } : {})}>
      <span>{message}</span>
      <button className="icon-button small" type="button" aria-label={dismissLabel} onClick={onDismiss}>
        <X size={14} />
      </button>
    </div>
  );
}

export function PluginConfirmationDialog({
  request,
  onResolve,
}: {
  readonly request: WorkbenchConfirmRequest | undefined;
  readonly onResolve: (confirmed: boolean) => void;
}) {
  if (!request) return null;
  return (
    <ConfirmationDialog
      titleId="plugin-confirm-title"
      title={request.title}
      confirmLabel={request.confirmLabel ?? "Confirmar"}
      cancelLabel={request.cancelLabel ?? "Cancelar"}
      danger={request.danger !== false}
      onCancel={() => onResolve(false)}
      onConfirm={() => onResolve(true)}
    >
      <p>{request.message}</p>
      {request.detail ? <p className="muted">{request.detail}</p> : null}
    </ConfirmationDialog>
  );
}

export interface WorkbenchSharedOverlaysProps {
  readonly dialog: ActiveWorkbenchDialog | undefined;
  readonly onDialogChange: Dispatch<SetStateAction<ActiveWorkbenchDialog | undefined>>;
  readonly contextMenuRef: Ref<WorkbenchContextMenuHandle>;
  readonly workspaceName: string;
  readonly contextMenuDisabled: boolean;
  readonly onContextMenuDismiss: () => void;
  readonly onContextMenuExecute: (
    item: ResourceContextMenuItem,
    target: WorkbenchContextMenuTarget,
  ) => void;
  readonly pluginNotification: string | undefined;
  readonly onDismissPluginNotification: () => void;
  readonly error: string | undefined;
  readonly onDismissError: () => void;
  readonly confirmRequest: WorkbenchConfirmRequest | undefined;
  readonly onResolveConfirm: (confirmed: boolean) => void;
}

/**
 * Conjunto de overlays presente em qualquer shell do workbench (janela principal ou janela de
 * painel destacada): diálogo de plugin, menu de contexto, toasts de erro e confirmação de plugin.
 */
export function WorkbenchSharedOverlays({
  dialog,
  onDialogChange,
  contextMenuRef,
  workspaceName,
  contextMenuDisabled,
  onContextMenuDismiss,
  onContextMenuExecute,
  pluginNotification,
  onDismissPluginNotification,
  error,
  onDismissError,
  confirmRequest,
  onResolveConfirm,
}: WorkbenchSharedOverlaysProps) {
  return (
    <>
      <WorkbenchPluginDialog dialog={dialog} onChange={onDialogChange} />
      <WorkbenchContextMenuHost
        ref={contextMenuRef}
        workspaceName={workspaceName}
        disabled={contextMenuDisabled}
        onDismiss={onContextMenuDismiss}
        onExecute={onContextMenuExecute}
      />
      <DismissibleErrorToast
        message={pluginNotification}
        source="plugin-notification"
        dismissLabel="Fechar notificação"
        onDismiss={onDismissPluginNotification}
      />
      <DismissibleErrorToast message={error} onDismiss={onDismissError} />
      <PluginConfirmationDialog request={confirmRequest} onResolve={onResolveConfirm} />
    </>
  );
}
