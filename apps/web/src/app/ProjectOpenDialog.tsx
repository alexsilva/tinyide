import { Clock3, ExternalLink, FolderOpen, Trash2, X } from "lucide-react";
import type { ProjectOpenTarget, RecentProject } from "./project-history";

export function ProjectOpenDialog({
  recentProjects,
  target,
  rememberChoice,
  desktop,
  busy,
  onTargetChange,
  onRememberChoiceChange,
  onChooseProject,
  onOpenRecent,
  onRemoveRecent,
  onClose,
}: {
  readonly recentProjects: readonly RecentProject[];
  readonly target: Exclude<ProjectOpenTarget, "ask">;
  readonly rememberChoice: boolean;
  readonly desktop: boolean;
  readonly busy: boolean;
  readonly onTargetChange: (target: Exclude<ProjectOpenTarget, "ask">) => void;
  readonly onRememberChoiceChange: (value: boolean) => void;
  readonly onChooseProject: () => void;
  readonly onOpenRecent: (project: RecentProject) => void;
  readonly onRemoveRecent: (project: RecentProject) => void;
  readonly onClose: () => void;
}) {
  const newTargetLabel = desktop ? "Nova janela" : "Nova aba";
  return (
    <div className="project-open-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section className="project-open-dialog" role="dialog" aria-modal="true" aria-labelledby="project-open-title">
        <header className="project-open-dialog__header">
          <div>
            <h2 id="project-open-title">Abrir projeto</h2>
            <p>Escolha onde abrir e selecione um projeto recente ou outro projeto.</p>
          </div>
          <button className="icon-button small" type="button" aria-label="Fechar" disabled={busy} onClick={onClose}><X size={15} /></button>
        </header>

        <fieldset className="project-open-target" disabled={busy}>
          <legend>Abrir em</legend>
          <label><input type="radio" name="project-open-target" checked={target === "current"} onChange={() => onTargetChange("current")} /> Tela atual</label>
          <label><input type="radio" name="project-open-target" checked={target === "new"} onChange={() => onTargetChange("new")} /> {newTargetLabel}</label>
          <label className="project-open-target__remember"><input type="checkbox" checked={rememberChoice} onChange={(event) => onRememberChoiceChange(event.target.checked)} /> Usar esta opção como padrão</label>
        </fieldset>

        <button className="button primary project-open-dialog__choose" type="button" disabled={busy} onClick={onChooseProject}>
          <FolderOpen size={15} /> Escolher outro projeto
        </button>

        <div className="project-open-recents__heading"><Clock3 size={14} /><strong>Recentes</strong></div>
        <div className="project-open-recents" role="list">
          {recentProjects.map((project) => (
            <article className="project-open-recent" role="listitem" key={project.id}>
              <button className="project-open-recent__main" type="button" disabled={busy} onClick={() => onOpenRecent(project)}>
                <span className="project-open-recent__icon"><FolderOpen size={16} /></span>
                <span className="project-open-recent__text">
                  <strong>{project.name}</strong>
                  <small>{project.path ?? "Projeto do navegador"}</small>
                </span>
                <span className="project-open-recent__kind">Projeto</span>
                {target === "new" ? <ExternalLink size={14} /> : null}
              </button>
              <button className="icon-button small" type="button" aria-label={`Remover ${project.name} dos recentes`} disabled={busy} onClick={() => onRemoveRecent(project)}><Trash2 size={14} /></button>
            </article>
          ))}
          {!recentProjects.length ? <p className="project-open-recents__empty">Nenhum projeto foi aberto anteriormente.</p> : null}
        </div>
      </section>
    </div>
  );
}
