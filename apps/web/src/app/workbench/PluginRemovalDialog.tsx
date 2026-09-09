import { ConfirmationDialog } from "./ConfirmationDialog";

export interface PluginRemovalDialogProps {
  readonly pluginName: string;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

/** Confirmação destrutiva de remoção de plugin, com o nome do plugin em destaque. */
export function PluginRemovalDialog({ pluginName, onCancel, onConfirm }: PluginRemovalDialogProps) {
  return (
    <ConfirmationDialog
      titleId="plugin-removal-title"
      title="Remover plugin?"
      confirmLabel="Remover"
      onCancel={onCancel}
      onConfirm={onConfirm}
    >
      <p>O plugin <strong>{pluginName}</strong> será desativado e removido da aplicação.</p>
    </ConfirmationDialog>
  );
}
