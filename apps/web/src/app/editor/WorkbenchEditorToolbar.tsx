import { ArrowLeft, ArrowRight, Code2, Save } from "lucide-react";
import type { WorkbenchEditorToolbarItem } from "@tinyide/plugin-api";
import type { OpenDocument } from "../../browser-filesystem";
import { WorkbenchIcon } from "../workbench/activity-components";
import { EditorSearchBox, type EditorSearchBoxProps } from "./EditorSearchBox";
import { EditorGoToLine, type EditorGoToLineProps } from "./EditorGoToLine";

export interface WorkbenchEditorToolbarProps {
  /** Documento atualmente ativo no editor. */
  readonly document: OpenDocument | undefined;
  /** Se há histórico anterior para navegar. */
  readonly canNavigateBack: boolean;
  /** Se há histórico posterior para navegar. */
  readonly canNavigateForward: boolean;
  /** Callback para navegar no histórico do cursor/posição. */
  readonly onNavigateHistory: (direction: "back" | "forward") => void;
  /** Propriedades da caixa de busca do editor. */
  readonly searchProps: EditorSearchBoxProps;
  /** Propriedades da caixa "Ir para linha" do editor. */
  readonly goToLineProps: EditorGoToLineProps;
  /** Ações de toolbar adicionadas por plugins do editor. */
  readonly toolbarItems: readonly WorkbenchEditorToolbarItem[];
  /** Callback para executar ação customizada de toolbar de plugin. */
  readonly onExecuteToolbarItem: (item: WorkbenchEditorToolbarItem) => void;
  /** Se o provedor de linguagem do documento possui regras de lint configuráveis. */
  readonly hasLintRules: boolean;
  /** Callback para abrir configurações de lint. */
  readonly onOpenLintSettings: () => void;
  /** Se o documento pode ser salvo. */
  readonly canSave: boolean;
  /** Callback para salvar o documento ativo. */
  readonly onSave: () => void;
}

/** Retorna o ícone apropriado para uma contribuição de ação na toolbar do editor. */
function EditorToolbarItemIcon({ icon }: { readonly icon: WorkbenchEditorToolbarItem["icon"] }) {
  const normalized = icon === "undo" ? "undo"
    : icon === "diff" ? "diff"
    : icon === "back" ? "back"
    : icon === "forward" ? "forward"
    : icon === "history" ? "history"
    : icon === "preview" ? "preview"
    : icon === "plus" ? "plus"
    : "file";
  return <WorkbenchIcon icon={normalized} size={14} />;
}

/**
 * Barra de ferramentas do editor de código (editor-toolbar).
 * Contém o breadcrumb com o caminho do arquivo, navegação pelo histórico de edições (Alt+Seta),
 * pesquisa/substituição no arquivo, navegação para linha, ações de plugins, lint e salvar.
 */
export function WorkbenchEditorToolbar({
  document,
  canNavigateBack,
  canNavigateForward,
  onNavigateHistory,
  searchProps,
  goToLineProps,
  toolbarItems,
  onExecuteToolbarItem,
  hasLintRules,
  onOpenLintSettings,
  canSave,
  onSave,
}: WorkbenchEditorToolbarProps) {
  const breadcrumb = document?.path ?? document?.origin ?? document?.name ?? "";

  return (
    <div className="editor-toolbar">
      <div className="breadcrumb">{breadcrumb}</div>
      <div className="editor-actions">
        <button
          className="icon-button small"
          type="button"
          aria-label="Voltar para posição anterior"
          title="Voltar para posição anterior (Alt+Seta esquerda)"
          disabled={!canNavigateBack}
          onClick={() => onNavigateHistory("back")}
        >
          <ArrowLeft size={14} />
        </button>
        <button
          className="icon-button small"
          type="button"
          aria-label="Avançar para próxima posição"
          title="Avançar para próxima posição (Alt+Seta direita)"
          disabled={!canNavigateForward}
          onClick={() => onNavigateHistory("forward")}
        >
          <ArrowRight size={14} />
        </button>

        <EditorSearchBox {...searchProps} />
        <EditorGoToLine {...goToLineProps} />

        {toolbarItems.map((item) => (
          <button
            key={item.id}
            className="icon-button small"
            type="button"
            aria-label={item.label}
            title={item.label}
            disabled={item.enabled === false}
            onClick={() => onExecuteToolbarItem(item)}
          >
            <EditorToolbarItemIcon icon={item.icon} />
          </button>
        ))}

        {hasLintRules ? (
          <button
            className="icon-button small"
            type="button"
            aria-label="Configurar lint"
            title="Configurar lint"
            onClick={onOpenLintSettings}
          >
            <Code2 size={14} />
          </button>
        ) : null}

        <button
          className="icon-button small"
          type="button"
          aria-label="Salvar arquivo"
          title="Salvar arquivo"
          disabled={!canSave}
          onClick={onSave}
        >
          <Save size={14} />
        </button>
      </div>
    </div>
  );
}
