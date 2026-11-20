import * as React from "react";
import { Search, Trash2, X } from "lucide-react";
import type { RecentProject } from "./project-history";

export function RecentProjectsManager({
  recentProjects,
  busy,
  onOpenRecent,
  onRemoveRecent,
  onClose,
}: {
  readonly recentProjects: readonly RecentProject[];
  readonly busy: boolean;
  readonly onOpenRecent: (project: RecentProject) => void;
  readonly onRemoveRecent: (project: RecentProject) => void;
  readonly onClose: () => void;
}) {
  const [search, setSearch] = React.useState("");

  const filtered = recentProjects.filter((project) => {
    if (!search.trim()) return true;
    const query = search.trim().toLowerCase();
    return project.name.toLowerCase().includes(query)
      || (project.path ?? "").toLowerCase().includes(query);
  });

  return (
    <div className="recent-projects-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !busy) onClose();
    }}>
      <section className="recent-projects-dialog" role="dialog" aria-modal="true" aria-labelledby="recent-projects-title">
        <header className="recent-projects-dialog__header">
          <div>
            <h2 id="recent-projects-title">Projetos recentes</h2>
            <p>Gerencie a lista de projetos abertos recentemente. Remover um projeto não apaga arquivos do disco.</p>
          </div>
          <button className="icon-button small" type="button" aria-label="Fechar" disabled={busy} onClick={onClose}><X size={15} /></button>
        </header>

        <div className="recent-projects-dialog__search">
          <Search size={14} />
          <input
            type="text"
            placeholder="Buscar por nome ou caminho..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="recent-projects-dialog__list" role="list">
          {filtered.map((project) => (
            <article className="recent-projects-item" role="listitem" key={project.id}>
              <button className="recent-projects-item__main" type="button" disabled={busy} onClick={() => onOpenRecent(project)}>
                <span className="recent-projects-item__text">
                  <strong>{project.name}</strong>
                  {project.path ? <small>{project.path}</small> : <small>Projeto do navegador</small>}
                </span>
              </button>
              <button
                className="icon-button small recent-projects-item__remove"
                type="button"
                aria-label={`Remover ${project.name} dos recentes`}
                disabled={busy}
                onClick={() => onRemoveRecent(project)}
              ><Trash2 size={14} /></button>
            </article>
          ))}
          {!filtered.length ? (
            <p className="recent-projects-dialog__empty">
              {search.trim() ? "Nenhum projeto corresponde à busca." : "Nenhum projeto recente."}
            </p>
          ) : null}
        </div>

        <footer className="recent-projects-dialog__footer">
          <span className="recent-projects-dialog__hint">
            Remover um projeto apenas remove o histórico, não apaga arquivos.
          </span>
        </footer>
      </section>
    </div>
  );
}
