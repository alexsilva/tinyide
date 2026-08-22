import { HardDrive, X } from "lucide-react";
import type { FormEvent } from "react";
import type {
  ExecutionEnvironment,
  ExecutionEnvironmentProvider,
} from "@tinyide/plugin-api";
import { EnvironmentPackageManager } from "./EnvironmentPackageManager";
import { ButtonTooltip, WorkbenchActivityIconView, WorkbenchIcon } from "../workbench/activity-components";

export type EnvironmentFormKind = "addExecutable" | "importEnvironment" | "createEnvironment" | "dependencies" | "edit";

export interface EnvironmentManagerSidebarProps {
  readonly environments: readonly ExecutionEnvironment[];
  readonly providers: readonly ExecutionEnvironmentProvider[];
  readonly activeProvider: ExecutionEnvironmentProvider | undefined;
  readonly providerEnvironments: readonly ExecutionEnvironment[];
  readonly visibleEnvironments: readonly ExecutionEnvironment[];
  readonly selectedEnvironmentId: string | undefined;
  readonly selectedEnvironmentIds: Readonly<Record<string, string>>;
  readonly managedCount: number;
  readonly importedCount: number;
  readonly executableCount: number;
  readonly search: string;
  readonly form: EnvironmentFormKind | undefined;
  readonly path: string;
  readonly editingEnvironment: ExecutionEnvironment | undefined;
  readonly packageManagerEnvironment: ExecutionEnvironment | undefined;
  readonly packageManagerProvider: ExecutionEnvironmentProvider | undefined;
  readonly busy: boolean;
  readonly onRefresh: () => void;
  readonly onSelectProvider: (providerId: string) => void;
  readonly onSearchChange: (value: string) => void;
  readonly onOpenForm: (kind: EnvironmentFormKind, providerId: string | undefined) => void;
  readonly onCloseForm: () => void;
  readonly onSubmitForm: (event: FormEvent<HTMLFormElement>) => void;
  readonly onPickPath: (mode: "file" | "directory", executableOnly?: boolean) => Promise<string | undefined>;
  readonly onPathChange: (path: string) => void;
  readonly onSelectEnvironment: (environmentId: string) => void;
  readonly onRemoveEnvironment: (environmentId: string) => void;
  readonly onEditEnvironment: (environment: ExecutionEnvironment) => void;
  readonly onManagePackages: (environmentId: string) => void;
  readonly onClosePackageManager: () => void;
  readonly onPackageManagerEnvironmentChanged: (environmentId: string) => Promise<void>;
  readonly providerCanUpdate: (providerId: string | undefined) => boolean;
}

/**
 * Self-contained presentation for the execution-environment sidebar. Environment lifecycle and
 * persistence remain in the App; this component owns the sizeable provider/form/list UI.
 */
export function EnvironmentManagerSidebar({
  environments,
  providers,
  activeProvider,
  providerEnvironments,
  visibleEnvironments,
  selectedEnvironmentId,
  selectedEnvironmentIds,
  managedCount,
  importedCount,
  executableCount,
  search,
  form,
  path,
  editingEnvironment,
  packageManagerEnvironment,
  packageManagerProvider,
  busy,
  onRefresh,
  onSelectProvider,
  onSearchChange,
  onOpenForm,
  onCloseForm,
  onSubmitForm,
  onPickPath,
  onPathChange,
  onSelectEnvironment,
  onRemoveEnvironment,
  onEditEnvironment,
  onManagePackages,
  onClosePackageManager,
  onPackageManagerEnvironmentChanged,
  providerCanUpdate,
}: EnvironmentManagerSidebarProps) {
  if (packageManagerEnvironment && packageManagerProvider) {
    return (
      <div className="sidebar-content environment-manager">
        <EnvironmentPackageManager
          environment={packageManagerEnvironment}
          provider={packageManagerProvider}
          onClose={onClosePackageManager}
          onEnvironmentChanged={() => onPackageManagerEnvironmentChanged(packageManagerEnvironment.id)}
        />
      </div>
    );
  }

  return (
    <div className="sidebar-content environment-manager">
      <div className="environment-manager__intro">
        <div>
          <strong>Ambientes de execução</strong>
          <p>Gerencie intérpretes, ambientes e pacotes do workspace atual.</p>
        </div>
        <ButtonTooltip label="Atualizar ambientes" side="left">
          <button className="icon-button small" type="button" aria-label="Atualizar ambientes" onClick={onRefresh}>
            <WorkbenchIcon icon="refresh" size={14} />
          </button>
        </ButtonTooltip>
      </div>

      {providers.length > 1 ? (
        <div className="environment-manager__tabs" role="tablist" aria-label="Provedores de ambientes">
          {providers.map((provider) => (
            <ButtonTooltip label={provider.name} key={provider.id}>
              <button
                className={`button compact ${activeProvider?.id === provider.id ? "primary" : "secondary"}`}
                type="button"
                role="tab"
                aria-label={provider.name}
                aria-selected={activeProvider?.id === provider.id}
                onClick={() => onSelectProvider(provider.id)}
              >
                <WorkbenchActivityIconView icon={provider.icon} />
                <span className="responsive-action__label">{provider.name}</span>
              </button>
            </ButtonTooltip>
          ))}
        </div>
      ) : null}

      <div className="environment-manager__summary">
        <span><WorkbenchIcon icon="check" size={13} /> {providerEnvironments.length} ambientes</span>
        <span><WorkbenchIcon icon="package" size={13} /> {managedCount} gerenciados</span>
        <span><WorkbenchIcon icon="folder-open" size={13} /> {importedCount} importados</span>
        <span><WorkbenchIcon icon="terminal" size={13} /> {executableCount} executáveis</span>
      </div>

      <label className="search-field environment-manager__search">
        <WorkbenchIcon icon="search" size={14} />
        <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Buscar ambiente por nome, versão ou caminho" />
      </label>

      <div className="environment-manager__toolbar">
        <ButtonTooltip label="Criar ambiente">
          <button className="button primary compact" type="button" aria-label="Criar ambiente" onClick={() => onOpenForm("createEnvironment", activeProvider?.id)}>
            <WorkbenchIcon icon="plus" size={14} /><span className="responsive-action__label">Criar</span>
          </button>
        </ButtonTooltip>
        <ButtonTooltip label="Importar ambiente">
          <button className="button secondary compact" type="button" aria-label="Importar ambiente" onClick={() => onOpenForm("importEnvironment", activeProvider?.id)}>
            <WorkbenchIcon icon="folder-open" size={14} /><span className="responsive-action__label">Importar</span>
          </button>
        </ButtonTooltip>
        <ButtonTooltip label={`Adicionar executável em ${activeProvider?.name ?? "ambientes"}`}>
          <button className="button secondary compact" type="button" aria-label="Adicionar executável" onClick={() => onOpenForm("addExecutable", activeProvider?.id)}>
            <WorkbenchIcon icon="terminal" size={14} /><span className="responsive-action__label">Executável</span>
          </button>
        </ButtonTooltip>
      </div>

      {form ? (
        <form className="environment-form" onSubmit={onSubmitForm}>
          <strong>{form === "addExecutable" ? "Adicionar executável" : form === "importEnvironment" ? "Importar ambiente existente" : form === "createEnvironment" ? "Criar ambiente" : form === "edit" ? "Editar ambiente" : "Instalar dependências"}</strong>
          {form === "addExecutable" ? (
            <>
              <label>Nome<input name="name" placeholder="Runtime local" /></label>
              <label>Executável<div className="path-row"><input readOnly value={path} placeholder="Nenhum executável selecionado" /><button className="button secondary compact" type="button" onClick={() => void onPickPath("file", true).then((nextPath) => { if (nextPath) onPathChange(nextPath); })}><WorkbenchIcon icon="search" size={13} /> Procurar</button></div></label>
            </>
          ) : null}
          {form === "importEnvironment" ? (
            <>
              <label>Nome opcional<input name="name" /></label>
              <label>Pasta<div className="path-row"><input readOnly value={path} placeholder="Nenhum venv selecionado" /><button className="button secondary compact" type="button" onClick={() => void onPickPath("directory").then((nextPath) => { if (nextPath) onPathChange(nextPath); })}><WorkbenchIcon icon="folder-open" size={13} /> Procurar</button></div></label>
            </>
          ) : null}
          {form === "createEnvironment" ? (
            <>
              <label>Nome<input name="name" defaultValue=".venv" /></label>
              <label>Executável de origem<select name="baseExecutable" defaultValue={environments.find((environment) => environment.providerId === activeProvider?.id && environment.executable)?.executable ?? ""}><option value="">Selecione</option>{environments.filter((environment) => environment.providerId === activeProvider?.id && environment.executable).map((environment) => <option key={environment.id} value={environment.executable}>{environment.name}</option>)}</select></label>
              <label>Diretório opcional<input name="path" /></label>
            </>
          ) : null}
          {form === "edit" && editingEnvironment ? (
            <>
              <label>Nome<input name="name" defaultValue={editingEnvironment.name} /></label>
              <label>{editingEnvironment.type === "venv" ? "Pasta" : "Executável"}<div className="path-row"><input readOnly value={path} /><button className="button secondary compact" type="button" onClick={() => void onPickPath(editingEnvironment.type === "venv" ? "directory" : "file", editingEnvironment.type === "process").then((nextPath) => { if (nextPath) onPathChange(nextPath); })}><WorkbenchIcon icon="search" size={13} /> Procurar</button></div></label>
            </>
          ) : null}
          {form === "dependencies" ? <label>Dependências<input name="dependencies" placeholder="pacote-a pacote-b" /></label> : null}
          <div className="dialog-actions">
            <button className="button secondary compact" type="button" onClick={onCloseForm}><X size={13} /> Cancelar</button>
            <button className="button primary compact" disabled={busy} type="submit"><WorkbenchIcon icon="check" size={13} /> Confirmar</button>
          </div>
        </form>
      ) : null}

      <div className="environment-list">
        {visibleEnvironments.map((environment) => {
          const environmentSelected = environment.providerId
            ? selectedEnvironmentIds[environment.providerId] === environment.id
            : selectedEnvironmentId === environment.id;
          const canChooseDefault = providerEnvironments.length > 1;
          return (
            <article className={`environment-card${environmentSelected ? " is-active" : ""}`} key={environment.id}>
              <button className="card-delete" type="button" aria-label={`Remover ${environment.name}`} title={`Remover ${environment.name}`} onClick={() => onRemoveEnvironment(environment.id)}><X size={14} /></button>
              <div>
                <strong>{environment.name}</strong>
                <div className="environment-card__badges">
                  <span className={`environment-chip is-${environment.status}`}>{environment.status === "ready" ? <WorkbenchIcon icon="check" size={12} /> : <WorkbenchIcon icon="problems" size={12} />}{environment.status === "ready" ? "Pronto" : environment.status === "creating" ? "Criando" : "Erro"}</span>
                  <span className="environment-chip">{environment.type === "venv" ? environment.managed === false ? <WorkbenchIcon icon="folder-open" size={12} /> : <WorkbenchIcon icon="package" size={12} /> : <WorkbenchIcon icon="terminal" size={12} />}{environment.type === "venv" ? environment.managed === false ? "Importado" : "Gerenciado" : "Executável"}</span>
                  {environment.version ? <span className="environment-chip"><WorkbenchIcon icon="box" size={12} /> {environment.version}</span> : null}
                </div>
                <small>{environment.executable ?? environment.path}</small>
              </div>
              <div className="environment-card__actions">
                {canChooseDefault ? (
                  <label className="environment-default-choice" title={environmentSelected ? "Ambiente padrão deste provider" : `Definir ${environment.name} como ambiente padrão`}>
                    <input
                      type="radio"
                      name={`default-environment-${environment.providerId ?? "global"}`}
                      checked={environmentSelected}
                      disabled={environment.status !== "ready"}
                      onChange={() => onSelectEnvironment(environment.id)}
                      aria-label={environmentSelected ? `${environment.name}: ambiente padrão` : `Definir ${environment.name} como ambiente padrão`}
                    />
                    <span>{environmentSelected ? "Padrão" : "Definir padrão"}</span>
                  </label>
                ) : environmentSelected ? (
                  <span className="environment-default-single"><WorkbenchIcon icon="check" size={13} /> Padrão</span>
                ) : null}
                {providerCanUpdate(environment.providerId) ? (
                  <ButtonTooltip label={`Editar ${environment.name}`}>
                    <button className="button secondary compact" type="button" aria-label={`Editar ${environment.name}`} onClick={() => onEditEnvironment(environment)}><WorkbenchIcon icon="settings" size={13} /><span className="responsive-action__label">Editar</span></button>
                  </ButtonTooltip>
                ) : null}
                {environment.type === "venv" ? (
                  <ButtonTooltip label={`Gerenciar pacotes de ${environment.name}`}>
                    <button className="button secondary compact" type="button" aria-label={`Gerenciar pacotes de ${environment.name}`} onClick={() => onManagePackages(environment.id)}><WorkbenchIcon icon="package" size={13} /><span className="responsive-action__label">Pacotes</span></button>
                  </ButtonTooltip>
                ) : null}
              </div>
            </article>
          );
        })}
        {!visibleEnvironments.length ? (
          <div className="empty-sidebar"><HardDrive size={26} /><p>{search ? "Nenhum ambiente corresponde à busca." : `Nenhum ambiente em ${activeProvider?.name ?? "este provider"}.`}</p></div>
        ) : null}
      </div>
    </div>
  );
}
