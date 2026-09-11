import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, FolderPlus } from "lucide-react";
import type { WorkspaceFileCreationOption } from "@tinyide/plugin-api";
import { FileCreationMenuItems } from "./FileCreationMenuItems";
import { WorkbenchIcon } from "./activity-components";

export interface WorkbenchWelcomeViewProps {
  /** Opções de criação de arquivo registradas por plugins e pelo core. */
  readonly fileCreationOptions: readonly WorkspaceFileCreationOption[];
  /** Callback para criar um novo documento (opcionalmente com template/extensão específica). */
  readonly onNewDocument: (option?: WorkspaceFileCreationOption) => void;
  /** Callback para abrir um único arquivo do sistema de arquivos ou storage. */
  readonly onOpenFile: () => void;
  /** Callback para criar e abrir uma nova pasta de projeto. */
  readonly onCreateProject: () => void;
  /** Callback para abrir o diálogo de seleção de projeto/workspace. */
  readonly onOpenProject: () => void;
}

/**
 * Tela inicial ("welcome screen") exibida na área principal do editor quando nenhum documento está aberto.
 * Apresenta ações rápidas: criar novo documento (com dropdown para opções de plugins),
 * abrir arquivo e um dropdown de projeto (criar/abrir), além dos atalhos de teclado.
 */
export function WorkbenchWelcomeView({
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
              <DropdownMenu.Item className="menu-item" onSelect={onCreateProject}>
                <FolderPlus size={15} /> Criar projeto
              </DropdownMenu.Item>
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
