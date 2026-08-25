import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { LanguageProvider } from "@tinyide/plugin-api";

export interface LintSettingsDialogProps {
  readonly open: boolean;
  readonly provider?: LanguageProvider;
  readonly enabledRuleIds: readonly string[];
  readonly onOpenChange: (open: boolean) => void;
  readonly onEnabledRuleIdsChange: (ids: readonly string[]) => void | Promise<void>;
}

export function LintSettingsDialog({
  open,
  provider,
  enabledRuleIds,
  onOpenChange,
  onEnabledRuleIdsChange,
}: LintSettingsDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="lint-settings-dialog">
          <div className="dialog-heading">
            <div>
              <span className="eyebrow">ANÁLISE</span>
              <Dialog.Title>Configurar lint</Dialog.Title>
              <Dialog.Description>
                Selecione os casos que {provider?.name ?? "o provider"} deve detectar neste workspace.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild><button className="icon-button" type="button" aria-label="Fechar"><X size={16} /></button></Dialog.Close>
          </div>
          <div className="lint-rule-list">
            {(provider?.lintRules ?? []).map((rule) => (
              <label className="lint-rule" key={rule.id}>
                <input
                  type="checkbox"
                  checked={enabledRuleIds.includes(rule.id)}
                  onChange={(event) => {
                    const next = event.target.checked
                      ? [...new Set([...enabledRuleIds, rule.id])]
                      : enabledRuleIds.filter((id) => id !== rule.id);
                    void onEnabledRuleIdsChange(next);
                  }}
                />
                <span><strong>{rule.label}</strong>{rule.description ? <small>{rule.description}</small> : null}</span>
              </label>
            ))}
          </div>
          <div className="dialog-actions">
            <Dialog.Close asChild><button className="button primary" type="button">Concluir</button></Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
