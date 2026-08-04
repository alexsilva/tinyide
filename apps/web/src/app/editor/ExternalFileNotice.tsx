import { CheckCircle2, FileWarning, RefreshCw, RotateCw, X } from "lucide-react";

export interface ExternalFileNoticeState {
  readonly kind: "reloaded" | "conflict";
  readonly detectedAt: number;
}

export interface WorkspaceExternalSyncState {
  readonly status: "checking" | "applied";
  readonly affected: number;
}

export function ExternalFileNotice({
  notice,
  onReload,
  onKeep,
  onDismiss,
}: {
  readonly notice: ExternalFileNoticeState;
  onReload(): void;
  onKeep(): void;
  onDismiss(): void;
}) {
  const detectedAt = new Date(notice.detectedAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div
      className={`editor-external-file-notice is-${notice.kind}`}
      data-external-file-notice={notice.kind}
      role="status"
    >
      {notice.kind === "conflict" ? <FileWarning size={15} /> : <RefreshCw size={15} />}
      <div className="editor-external-file-notice__message">
        <strong>{notice.kind === "conflict" ? "Arquivo alterado fora da IDE" : "Arquivo atualizado externamente"}</strong>
        <span>
          {notice.kind === "conflict"
            ? "As alterações locais foram preservadas. Escolha qual versão deve continuar."
            : "O conteúdo do editor foi recarregado automaticamente."}
          {` Detectado às ${detectedAt}.`}
        </span>
      </div>
      <div className="editor-external-file-notice__actions">
        {notice.kind === "conflict" ? (
          <>
            <button type="button" onClick={onReload}>Recarregar do disco</button>
            <button type="button" onClick={onKeep}>Manter alterações locais</button>
          </>
        ) : (
          <button className="icon-button small" type="button" aria-label="Dispensar aviso de atualização externa" onClick={onDismiss}>
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

export function WorkspaceExternalSyncIndicator({ state }: { readonly state: WorkspaceExternalSyncState }) {
  const checking = state.status === "checking";
  return (
    <span
      className={`statusbar-external-sync is-${state.status}`}
      data-workspace-external-sync={state.status}
      role="status"
      aria-live="polite"
    >
      {checking ? <RotateCw size={12} /> : <CheckCircle2 size={12} />}
      <span>
        {checking
          ? "Verificando alterações externas…"
          : `${state.affected} ${state.affected === 1 ? "alteração externa aplicada" : "alterações externas aplicadas"}`}
      </span>
    </span>
  );
}
