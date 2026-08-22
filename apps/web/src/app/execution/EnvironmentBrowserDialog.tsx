import * as Dialog from "@radix-ui/react-dialog";
import { Check, Upload, X } from "lucide-react";
import type { ExecutionEnvironmentDirectoryListing } from "@tinyide/plugin-api";
import { WorkbenchIcon } from "../workbench/activity-components";

export interface EnvironmentBrowserDialogProps {
  readonly mode: "directory" | "file" | undefined;
  readonly executableOnly: boolean;
  readonly listing: ExecutionEnvironmentDirectoryListing | undefined;
  readonly filter: string;
  readonly hidden: boolean;
  readonly selection: string | undefined;
  readonly onClose: () => void;
  readonly onFilterChange: (value: string) => void;
  readonly onHiddenChange: (hidden: boolean) => void;
  readonly onNavigate: (path?: string) => void;
  readonly onSelect: (path: string) => void;
  readonly onConfirm: () => void;
}

export function EnvironmentBrowserDialog({
  mode,
  executableOnly,
  listing,
  filter,
  hidden,
  selection,
  onClose,
  onFilterChange,
  onHiddenChange,
  onNavigate,
  onSelect,
  onConfirm,
}: EnvironmentBrowserDialogProps) {
  const normalizedFilter = filter.trim().toLocaleLowerCase();
  return (
    <Dialog.Root open={Boolean(mode)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="file-browser-dialog">
          <div className="file-browser-heading">
            <div>
              <span className="eyebrow">SISTEMA DE ARQUIVOS</span>
              <Dialog.Title>{mode === "file" ? "Selecionar executável" : "Selecionar ambiente"}</Dialog.Title>
              <Dialog.Description>Navegue pelo host, selecione um item válido e confirme.</Dialog.Description>
            </div>
            <Dialog.Close asChild><button className="icon-button" type="button" aria-label="Fechar"><X size={16} /></button></Dialog.Close>
          </div>
          <div className="file-browser-controls">
            <label className="search-field">
              <WorkbenchIcon icon="search" size={15} />
              <input value={filter} onChange={(event) => onFilterChange(event.target.value)} placeholder="Filtrar nesta pasta" />
            </label>
            <label className="check-row">
              <input type="checkbox" checked={hidden} onChange={(event) => onHiddenChange(event.target.checked)} /> Mostrar ocultos
            </label>
          </div>
          <div className="file-browser-path">
            <button className="button secondary compact" type="button" disabled={!listing?.parentPath} onClick={() => onNavigate(listing?.parentPath)}><Upload size={14} /> Pasta pai</button>
            <code>{listing?.path ?? "Carregando..."}</code>
          </div>
          <div className="file-browser-selection">{selection ? <><Check size={16} /><strong>{selection}</strong></> : <span>Nenhum item selecionado.</span>}</div>
          <div className="file-browser-entries">
            {(listing?.entries ?? [])
              .filter((entry) => !normalizedFilter || entry.name.toLocaleLowerCase().includes(normalizedFilter))
              .map((entry) => {
                const selectable = mode === "file"
                  ? entry.kind === "file" && (!executableOnly || entry.executable)
                  : entry.kind === "directory" && entry.isEnvironment;
                const navigate = entry.kind === "directory" && !selectable;
                return (
                  <button
                    className={`file-browser-entry${selection === entry.path ? " is-selected" : ""}`}
                    type="button"
                    key={entry.path}
                    disabled={entry.kind === "file" && !selectable}
                    onDoubleClick={() => { if (navigate) onNavigate(entry.path); }}
                    onClick={() => selectable ? onSelect(entry.path) : navigate ? onNavigate(entry.path) : undefined}
                  >
                    {entry.kind === "directory" ? <WorkbenchIcon icon="folder" size={17} /> : <WorkbenchIcon icon="file" size={17} />}
                    <span>
                      <strong>{entry.name}</strong>
                      <small>{selectable
                        ? mode === "file"
                          ? executableOnly ? "Executável válido" : "Arquivo selecionável"
                          : "Ambiente válido"
                        : entry.kind === "directory" ? "Diretório" : "Arquivo"}</small>
                    </span>
                  </button>
                );
              })}
          </div>
          <div className="file-browser-footer">
            <button className="button secondary" type="button" onClick={onClose}>Cancelar</button>
            <button className="button primary" disabled={!selection} type="button" onClick={onConfirm}>Confirmar seleção</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
