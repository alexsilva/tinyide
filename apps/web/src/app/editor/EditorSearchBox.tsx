import { ChevronDown, ChevronUp, CornerDownRight, X } from "lucide-react";
import type { RefObject } from "react";
import { WorkbenchIcon } from "../workbench/activity-components";

export interface EditorSearchBoxProps {
  /** Se o widget de busca está aberto na barra de ferramentas do editor. */
  readonly open: boolean;
  /** Termo de busca atual. */
  readonly query: string;
  /** Mensagem de erro de sintaxe (ex: regex inválida). */
  readonly error?: string;
  /** Se a linha de substituição está visível. */
  readonly replaceOpen: boolean;
  /** Texto de substituição. */
  readonly replacement: string;
  /** Se a busca diferencia maiúsculas de minúsculas. */
  readonly caseSensitive: boolean;
  /** Se a busca interpreta a consulta como expressão regular. */
  readonly regex: boolean;
  /** Total de ocorrências encontradas. */
  readonly matchCount: number;
  /** Índice da ocorrência ativa (base 0). */
  readonly matchIndex: number;
  /** Se há uma ocorrência ativa atualmente selecionada. */
  readonly hasActiveMatch: boolean;
  /** Se a funcionalidade de substituição está habilitada (desabilitada em resource editors externos). */
  readonly canReplace: boolean;
  /** Se o botão de abrir busca deve ficar desabilitado (ex: sem documento de texto ativo). */
  readonly disabled?: boolean;
  /** Ref para o input de busca. */
  readonly searchInputRef: RefObject<HTMLInputElement | null>;
  /** Ref para o input de substituição. */
  readonly replaceInputRef: RefObject<HTMLInputElement | null>;
  /** Callback para abrir o painel de busca. */
  readonly onOpenSearch: () => void;
  /** Callback para fechar a busca e limpar o estado de busca. */
  readonly onCloseSearch: () => void;
  /** Callback para alterar o texto de busca. */
  readonly onQueryChange: (query: string) => void;
  /** Callback para alterar o texto de substituição. */
  readonly onReplacementChange: (replacement: string) => void;
  /** Callback para alternar sensibilidade de maiúsculas/minúsculas. */
  readonly onToggleCaseSensitive: () => void;
  /** Callback para alternar modo de expressão regular. */
  readonly onToggleRegex: () => void;
  /** Callback para abrir/fechar a linha de substituição. */
  readonly onToggleReplaceOpen: () => void;
  /** Callback para fechar apenas a linha de substituição e focar a busca. */
  readonly onCloseReplace: () => void;
  /** Callback para navegar entre ocorrências (avanço ou retrocesso). */
  readonly onSelectMatch: (index: number) => void;
  /** Callback para substituir a ocorrência atual. */
  readonly onReplaceCurrent: () => void;
  /** Callback para substituir todas as ocorrências. */
  readonly onReplaceAll: () => void;
}

/**
 * Caixa de busca e substituição no documento de texto ativo.
 * Renderiza o botão de acionamento (Ctrl+F) ou o widget expandido com controles de regex,
 * case sensitive, contagem de ocorrências, navegação e substituição simples/completa.
 */
export function EditorSearchBox({
  open,
  query,
  error,
  replaceOpen,
  replacement,
  caseSensitive,
  regex,
  matchCount,
  matchIndex,
  hasActiveMatch,
  canReplace,
  disabled,
  searchInputRef,
  replaceInputRef,
  onOpenSearch,
  onCloseSearch,
  onQueryChange,
  onReplacementChange,
  onToggleCaseSensitive,
  onToggleRegex,
  onToggleReplaceOpen,
  onCloseReplace,
  onSelectMatch,
  onReplaceCurrent,
  onReplaceAll,
}: EditorSearchBoxProps) {
  if (!open) {
    return (
      <button
        className="icon-button small"
        type="button"
        aria-label="Pesquisar no arquivo"
        title="Pesquisar no arquivo (Ctrl+F)"
        disabled={disabled}
        onClick={onOpenSearch}
      >
        <WorkbenchIcon icon="search" size={14} />
      </button>
    );
  }

  return (
    <div className="editor-search" role="search" data-invalid={error ? "true" : undefined}>
      <div className="editor-search__find-row">
        <WorkbenchIcon icon="search" size={13} className="editor-search__icon" />
        <input
          ref={searchInputRef}
          className="editor-search__input"
          type="search"
          value={query}
          aria-label="Pesquisar no arquivo aberto"
          aria-invalid={Boolean(error)}
          title={error}
          placeholder="Pesquisar no arquivo"
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            const key = event.key.toLocaleLowerCase();
            if ((event.ctrlKey || event.metaKey) && key === "f") {
              event.preventDefault();
              event.currentTarget.select();
              return;
            }
            if ((event.ctrlKey || event.metaKey) && key === "h") {
              event.preventDefault();
              // Ctrl+H abre a substituição; repeti-lo deve manter o campo aberto.
              if (canReplace && !replaceOpen) onToggleReplaceOpen();
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              if (replaceOpen) {
                onCloseReplace();
                return;
              }
              onCloseSearch();
              return;
            }
            if (event.key === "Enter" && matchCount) {
              event.preventDefault();
              onSelectMatch(matchIndex + (event.shiftKey ? -1 : 1));
            }
          }}
        />
        <button
          className="editor-search__toggle"
          type="button"
          aria-label="Diferenciar maiúsculas de minúsculas"
          aria-pressed={caseSensitive}
          title="Diferenciar maiúsculas de minúsculas"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onToggleCaseSensitive}
        >
          Aa
        </button>
        <button
          className="editor-search__toggle"
          type="button"
          aria-label="Interpretar como expressão regular"
          aria-pressed={regex}
          title="Interpretar o termo como expressão regular"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onToggleRegex}
        >
          .*
        </button>
        <span className="editor-search__count" aria-live="polite">
          {error ? "!" : matchCount ? `${matchIndex + 1}/${matchCount}` : "0"}
        </span>
        {canReplace ? (
          <button
            className="icon-button small"
            type="button"
            aria-label="Alternar substituição"
            aria-expanded={replaceOpen}
            title="Substituir (Ctrl+H)"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onToggleReplaceOpen}
          >
            <CornerDownRight size={12} />
          </button>
        ) : null}
        {matchCount > 1 ? (
          <>
            <button
              className="icon-button small"
              type="button"
              aria-label="Ocorrência anterior"
              title="Ocorrência anterior (Shift+Enter)"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelectMatch(matchIndex - 1)}
            >
              <ChevronUp size={12} />
            </button>
            <button
              className="icon-button small"
              type="button"
              aria-label="Próxima ocorrência"
              title="Próxima ocorrência (Enter)"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onSelectMatch(matchIndex + 1)}
            >
              <ChevronDown size={12} />
            </button>
          </>
        ) : null}
        <button
          className="icon-button small"
          type="button"
          aria-label="Fechar busca no arquivo"
          onClick={onCloseSearch}
        >
          <X size={12} />
        </button>
      </div>

      {replaceOpen && canReplace ? (
        <div className="editor-search__replace-row">
          <CornerDownRight className="editor-search__icon" size={13} />
          <input
            ref={replaceInputRef}
            className="editor-search__input"
            type="text"
            value={replacement}
            aria-label="Substituir por"
            placeholder="Substituir por"
            onChange={(event) => onReplacementChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onCloseReplace();
                searchInputRef.current?.focus({ preventScroll: true });
                return;
              }
              if (event.key === "Enter") {
                event.preventDefault();
                if (event.ctrlKey || event.metaKey) onReplaceAll();
                else onReplaceCurrent();
              }
            }}
          />
          <button
            className="editor-search__replace-action"
            type="button"
            disabled={!hasActiveMatch || Boolean(error)}
            title="Substituir ocorrência atual (Enter)"
            onClick={onReplaceCurrent}
          >
            Substituir
          </button>
          <button
            className="editor-search__replace-action"
            type="button"
            disabled={!matchCount || Boolean(error)}
            title="Substituir todas as ocorrências (Ctrl+Enter)"
            onClick={onReplaceAll}
          >
            Todos
          </button>
        </div>
      ) : null}
    </div>
  );
}
