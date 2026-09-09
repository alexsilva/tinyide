import { FolderPlus, Info, X } from "lucide-react";
import type { ProjectOpenTarget } from "./project-history";
import { normalizedProjectName, projectNameError } from "./project-creation";

export function ProjectCreateDialog({
  name,
  target,
  rememberChoice,
  desktop,
  busy,
  onNameChange,
  onTargetChange,
  onRememberChoiceChange,
  onCreate,
  onClose,
}: {
  readonly name: string;
  readonly target: Exclude<ProjectOpenTarget, "ask">;
  readonly rememberChoice: boolean;
  readonly desktop: boolean;
  readonly busy: boolean;
  readonly onNameChange: (name: string) => void;
  readonly onTargetChange: (target: Exclude<ProjectOpenTarget, "ask">) => void;
  readonly onRememberChoiceChange: (value: boolean) => void;
  readonly onCreate: () => void;
  readonly onClose: () => void;
}) {
  const normalizedName = normalizedProjectName(name);
  const validationError = projectNameError(name);
  const visibleError = name.length ? validationError : undefined;
  const newTargetLabel = desktop ? "Nova janela" : "Nova aba";

  return (
    <div className="project-open-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section className="project-open-dialog project-create-dialog" role="dialog" aria-modal="true" aria-labelledby="project-create-title">
        <form onSubmit={(event) => {
          event.preventDefault();
          if (!busy && !validationError) onCreate();
        }}>
          <header className="project-open-dialog__header">
            <div>
              <h2 id="project-create-title">Criar projeto</h2>
              <p>Crie uma pasta vazia em um local e abra-a como projeto.</p>
            </div>
            <button className="icon-button small" type="button" aria-label="Fechar" disabled={busy} onClick={onClose}><X size={15} /></button>
          </header>

          <label className="project-create-dialog__name">
            Nome do projeto
            <input
              autoFocus
              maxLength={121}
              value={name}
              placeholder="Ex.: meu-projeto"
              aria-invalid={visibleError ? true : undefined}
              aria-describedby="project-create-name-help"
              disabled={busy}
              onChange={(event) => onNameChange(event.target.value)}
            />
            <small id="project-create-name-help" className={visibleError ? "is-error" : undefined}>
              {visibleError ?? (normalizedName
                ? `A pasta “${normalizedName}” será criada dentro do local escolhido.`
                : "Você escolherá a pasta-pai na próxima etapa.")}
            </small>
          </label>

          <fieldset className="project-open-target" disabled={busy}>
            <legend>Abrir em</legend>
            <label><input type="radio" name="project-create-target" checked={target === "current"} onChange={() => onTargetChange("current")} /> Tela atual</label>
            <label><input type="radio" name="project-create-target" checked={target === "new"} onChange={() => onTargetChange("new")} /> {newTargetLabel}</label>
            <label className="project-open-target__remember"><input className="checkbox-sm" type="checkbox" checked={rememberChoice} onChange={(event) => onRememberChoiceChange(event.target.checked)} /> Usar esta opção como padrão</label>
          </fieldset>

          <p className="project-create-dialog__config-note">
            <Info size={13} />
            <span>O tinyIde criará <code>.tinyide/settings.json</code> para as configurações locais do projeto.</span>
          </p>

          <div className="project-create-dialog__actions">
            <button className="button secondary" type="button" disabled={busy} onClick={onClose}>Cancelar</button>
            <button className="button primary" type="submit" disabled={busy || Boolean(validationError)}>
              <FolderPlus size={15} /> {busy ? "Criando..." : "Escolher local e criar"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
