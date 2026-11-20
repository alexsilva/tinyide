import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, ChevronRight, FolderPlus } from "lucide-react";
import type { ProjectTypeProvider, WorkspaceFileCreationOption } from "@tinyide/plugin-api";
import { FileCreationMenuItems } from "./FileCreationMenuItems";
import { WorkbenchIcon } from "./activity-components";

export interface WorkbenchWelcomeViewProps {
  /** Opções de criação de arquivo registradas por plugins e pelo core. */
  readonly fileCreationOptions: readonly WorkspaceFileCreationOption[];
  /** Callback para criar um novo documento (opcionalmente com template/extensão específica). */
  readonly onNewDocument: (option?: WorkspaceFileCreationOption) => void;
  /** Callback para abrir um único arquivo do sistema de arquivos ou storage. */
  readonly onOpenFile: () => void;
  /** Tipos de projeto registrados por plugins (providers ativos). */
  readonly projectTypes: readonly ProjectTypeProvider[];
  /** Callback para criar e abrir uma nova pasta de projeto, opcionalmente com tipo. */
  readonly onCreateProject: (typeId?: string) => void;
  /** Callback para abrir o diálogo de seleção de projeto/workspace. */
  readonly onOpenProject: () => void;
}

/**
 * Tela inicial ("welcome screen") exibida na área principal do editor quando nenhum documento está aberto.
 * Apresenta ações rápidas: criar novo documento (com dropdown para opções de plugins),
 * abrir arquivo e um dropdown de projeto (criar/abrir), além dos atalhos de teclado.
 */
export function WorkbenchWelcomeView({
  projectTypes,
  fileCreationOptions: rawOptions,
  onNewDocument,
  onOpenFile,
  onCreateProject,
  onOpenProject,
}: WorkbenchWelcomeViewProps) {
  return (
    <div className="welcome-screen">
      <span className="welcome-kicker">Bem-vindo</span>
      <h1>tinyIde</h1>
      <p>Crie, abra ou arraste um arquivo para começar.</p>
      <div className="welcome-actions">
        {rawOptions.length ? (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="button primary" type="button">
                <WorkbenchIcon icon="plus" size={16} /> Novo arquivo <ChevronDown size={14} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="menu-content" align="center" sideOffset={6}>
                <FileCreationMenuItems options={rawOptions} onSelect={onNewDocument} />
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        ) : (
          <button className="button primary" type="button" onClick={() => onNewDocument()}>
            <WorkbenchIcon icon="plus" size={16} /> Novo arquivo
          </button>
        )}
        <button className="button secondary" type="button" onClick={onOpenFile}>
          <WorkbenchIcon icon="file" size={16} /> Abrir arquivo
        </button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button className="button secondary" type="button">
              <WorkbenchIcon icon="folder-open" size={16} /> Projeto <ChevronDown size={14} />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="menu-content" align="center" sideOffset={6}>
              <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger className="menu-item">
                  <FolderPlus size={15} /> Criar projeto <ChevronRight className="menu-item__submenu-arrow" size={14} />
                </DropdownMenu.SubTrigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.SubContent className="menu-content" sideOffset={6} alignOffset={-5}>
                    <DropdownMenu.Item className="menu-item" onSelect={() => onCreateProject(undefined)}>
                      Projeto vazio
                    </DropdownMenu.Item>
                    {projectTypes.map((type) => (
                      <DropdownMenu.Item key={type.id} className="menu-item" title={type.description} onSelect={() => onCreateProject(type.id)}>
                        {type.name}
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.SubContent>
                </DropdownMenu.Portal>
              </DropdownMenu.Sub>
              <DropdownMenu.Item className="menu-item" onSelect={onOpenProject}>
                <WorkbenchIcon icon="folder-open" size={15} /> Abrir projeto
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      <small>Atalhos: Ctrl+N, Ctrl+O, Ctrl+S e Ctrl+Shift+S</small>
    </div>
  );
}
