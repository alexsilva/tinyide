import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { AlignLeft, Check, ChevronDown, ChevronRight, FolderRoot, Info, RotateCw, Save, Settings2 } from "lucide-react";
import type {
  ExecutionProfile,
  WorkbenchStateApi,
  WorkbenchTitlebarContribution,
  WorkspaceFileCreationOption,
} from "@tinyide/plugin-api";
import type { RecentProject } from "../project-history";
import type { WorkspaceExecutionProfiles } from "../workspace-settings";
import { fileCreationOptions } from "../file-creation";
import { WorkbenchTitlebarHost } from "../workbench-plugin-hosts";
import { ButtonTooltip, WorkbenchIcon } from "./activity-components";

export interface WorkbenchTitlebarProps {
  readonly workspaceName: string;
  readonly recentProjects: readonly RecentProject[];
  readonly fileCreationOptions: readonly WorkspaceFileCreationOption[];
  readonly profiles: WorkspaceExecutionProfiles;
  readonly selectedProfile: ExecutionProfile | undefined;
  readonly selectedProfileRunning: boolean;
  readonly selectedProfileDebuggable: boolean;
  readonly debugSessionActive: boolean;
  readonly busy: boolean;
  readonly pageReloading: boolean;
  readonly contributions: readonly WorkbenchTitlebarContribution[];
  readonly workbenchState: WorkbenchStateApi;
  readonly onProjectMenuOpen: () => void;
  readonly onOpenProject: () => void;
  readonly onOpenRecentProject: (project: RecentProject) => void;
  readonly onNewDocument: (option?: WorkspaceFileCreationOption) => void;
  readonly onOpenFile: () => void;
  readonly onSave: (forceSaveAs?: boolean) => void;
  readonly canFormatDocument: boolean;
  readonly onFormatDocument: () => void;
  readonly onOpenSettings: () => void;
  readonly onOpenAbout: () => void;
  readonly onSelectProfile: (profileId: string | undefined) => void;
  readonly onManageProfiles: () => void;
  readonly onRunProfile: () => void;
  readonly onDebugProfile: () => void;
  readonly onReload: () => void;
}

/**
 * Presentation and interaction surface for the application titlebar. The App owns orchestration;
 * this component owns menus, profile selection and titlebar affordances.
 */
export function WorkbenchTitlebar({
  workspaceName,
  recentProjects,
  fileCreationOptions: creationOptions,
  profiles,
  selectedProfile,
  selectedProfileRunning,
  selectedProfileDebuggable,
  debugSessionActive,
  busy,
  pageReloading,
  contributions,
  workbenchState,
  onProjectMenuOpen,
  onOpenProject,
  onOpenRecentProject,
  onNewDocument,
  onOpenFile,
  onSave,
  canFormatDocument,
  onFormatDocument,
  onOpenSettings,
  onOpenAbout,
  onSelectProfile,
  onManageProfiles,
  onRunProfile,
  onDebugProfile,
  onReload,
}: WorkbenchTitlebarProps) {
  return (
    <header className="titlebar">
      <div className="app-brand"><img src="/icon.png" alt="tinyIde" /></div>
      <DropdownMenu.Root onOpenChange={(open) => { if (open) onProjectMenuOpen(); }}>
        <DropdownMenu.Trigger asChild>
          <button className="menu-button" type="button">Projeto <ChevronDown size={13} /></button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="menu-content" align="start" sideOffset={6}>
            <DropdownMenu.Item className="menu-item" onSelect={onOpenProject}>
              <WorkbenchIcon icon="folder-open" size={15} /> Abrir projeto...
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="menu-separator" />
            <DropdownMenu.Item className="menu-item" disabled>
              <WorkbenchIcon icon="history" size={15} /> Projetos recentes
            </DropdownMenu.Item>
            {recentProjects.slice(0, 10).map((project) => (
              <DropdownMenu.Item className="menu-item" key={project.id} onSelect={() => onOpenRecentProject(project)}>
                <FolderRoot size={15} />
                <span>{project.name}</span>
                {project.path ? <span className="menu-item__hint">{project.path}</span> : null}
              </DropdownMenu.Item>
            ))}
            {!recentProjects.length ? <DropdownMenu.Item className="menu-item" disabled>Nenhum projeto recente</DropdownMenu.Item> : null}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="menu-button" type="button">Arquivo <ChevronDown size={13} /></button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="menu-content" align="start" sideOffset={6}>
            {creationOptions.length ? (
              <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger className="menu-item">
                  <WorkbenchIcon icon="plus" size={15} /> Novo arquivo <ChevronRight className="menu-item__submenu-arrow" size={14} />
                </DropdownMenu.SubTrigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.SubContent className="menu-content" sideOffset={6} alignOffset={-5}>
                    {fileCreationOptions(creationOptions).map((option) => (
                      <DropdownMenu.Item
                        className="menu-item"
                        key={`${option.id}:${option.extension}`}
                        onSelect={() => onNewDocument(option)}
                      >
                        {option.icon ? (
                          <span
                            className="resource-icon resource-icon--menu"
                            title={option.icon.title}
                            style={{
                              color: option.icon.foreground ?? "currentColor",
                              background: option.icon.background ?? "transparent",
                            }}
                          >{option.icon.label}</span>
                        ) : <WorkbenchIcon icon="file" size={15} />}
                        <span>{option.label}</span>
                        <span className="menu-item__hint">{option.extension}</span>
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.SubContent>
                </DropdownMenu.Portal>
              </DropdownMenu.Sub>
            ) : (
              <DropdownMenu.Item className="menu-item" onSelect={() => onNewDocument()}>
                <WorkbenchIcon icon="plus" size={15} /> Novo arquivo
              </DropdownMenu.Item>
            )}
            <DropdownMenu.Item className="menu-item" onSelect={onOpenFile}>
              <WorkbenchIcon icon="file" size={15} /> Abrir arquivo
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="menu-separator" />
            <DropdownMenu.Item className="menu-item" onSelect={() => onSave()}><Save size={15} /> Salvar</DropdownMenu.Item>
            <DropdownMenu.Item className="menu-item" onSelect={() => onSave(true)}><Save size={15} /> Salvar como</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild><button className="menu-button" type="button">Editar <ChevronDown size={13} /></button></DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="menu-content" align="start" sideOffset={6}>
            <DropdownMenu.Item className="menu-item" disabled={!canFormatDocument} onSelect={onFormatDocument}>
              <AlignLeft size={15} /> Formatar documento
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="menu-separator" />
            <DropdownMenu.Item className="menu-item" onSelect={onOpenSettings}><Settings2 size={15} /> Configurações</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild><button className="menu-button" type="button">Ajuda <ChevronDown size={13} /></button></DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="menu-content" align="start" sideOffset={6}>
            <DropdownMenu.Item className="menu-item" onSelect={onOpenAbout}><Info size={15} /> Sobre</DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <div className="window-title">{workspaceName}</div>
      <div className="titlebar-actions">
        {contributions.map((provider) => (
          <WorkbenchTitlebarHost key={provider.id} provider={provider} state={workbenchState} />
        ))}
        <DropdownMenu.Root>
          <ButtonTooltip label={selectedProfile?.name ?? "Selecionar perfil"}>
            <DropdownMenu.Trigger asChild>
              <button
                className="execution-profile-select"
                type="button"
                aria-label="Perfil de execução"
                title={selectedProfile?.name ?? "Selecionar perfil"}
                data-placeholder={!selectedProfile ? "true" : undefined}
              >
                <span className="execution-profile-select__label">{selectedProfile?.name ?? "Selecionar perfil"}</span>
                <ChevronDown size={12} />
              </button>
            </DropdownMenu.Trigger>
          </ButtonTooltip>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="menu-content execution-profile-select__menu" align="end" sideOffset={6}>
              <DropdownMenu.Item className="menu-item" onSelect={() => onSelectProfile(undefined)}>
                <Check size={14} className="execution-profile-select__check" style={{ opacity: profiles.selectedId ? 0 : 1 }} />
                Sem perfil
              </DropdownMenu.Item>
              {profiles.profiles.map((profile) => (
                <DropdownMenu.Item
                  key={profile.id}
                  className="menu-item"
                  onSelect={() => onSelectProfile(profile.id)}
                  title={profile.name}
                >
                  <Check
                    size={14}
                    className="execution-profile-select__check"
                    style={{ opacity: profiles.selectedId === profile.id ? 1 : 0 }}
                  />
                  <span className="execution-profile-select__menu-label">{profile.name}</span>
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        <button className="icon-button small" type="button" aria-label="Gerenciar perfis" onClick={onManageProfiles}><Settings2 size={14} /></button>
        <ButtonTooltip label="Executar perfil">
          <button
            className="icon-button small"
            type="button"
            aria-label="Executar perfil"
            disabled={!selectedProfile || selectedProfileRunning || busy}
            onClick={onRunProfile}
          ><WorkbenchIcon icon="play" size={15} /></button>
        </ButtonTooltip>
        <ButtonTooltip label={selectedProfile && !selectedProfileDebuggable
          ? "O runtime selecionado não oferece depuração para este perfil"
          : "Depurar perfil"}>
          <button
            className="icon-button small debug-run"
            type="button"
            aria-label="Depurar perfil"
            disabled={!selectedProfileDebuggable || busy || debugSessionActive}
            onClick={onDebugProfile}
          ><WorkbenchIcon icon="bug" size={15} /></button>
        </ButtonTooltip>
      </div>
      <div className="titlebar-corner">
        <button
          className="icon-button small titlebar-reload-button"
          type="button"
          aria-label="Recarregar página"
          aria-busy={pageReloading}
          title="Recarregar página"
          disabled={pageReloading}
          onClick={onReload}
        ><RotateCw className={pageReloading ? "is-spinning" : undefined} size={14} /></button>
      </div>
    </header>
  );
}
