import { Hash } from "lucide-react";
import type { RefObject } from "react";

export interface EditorGoToLineProps {
  /** Se o widget de "Ir para linha" está aberto. */
  readonly open: boolean;
  /** Valor digitado no campo numérico de linha. */
  readonly value: string;
  /** Número total de linhas do documento (para validação e placeholder). */
  readonly lineCount: number;
  /** Se o botão deve ficar desabilitado (ex: sem arquivo de texto ativo ou em editor externo). */
  readonly disabled?: boolean;
  /** Ref para o input numérico de linha. */
  readonly inputRef: RefObject<HTMLInputElement | null>;
  /** Callback para abrir o popup. */
  readonly onOpen: () => void;
  /** Callback para fechar o popup sem navegar. */
  readonly onClose: (restoreEditorFocus?: boolean) => void;
  /** Callback para atualizar o valor digitado. */
  readonly onChange: (value: string) => void;
  /** Callback para navegar para a linha informada. */
  readonly onGoToLine: (line: number) => void;
}

/**
 * Caixa rápida de navegação direta para linha (Ctrl+G).
 * Renderiza o botão na barra de ferramentas ou o campo numérico aberto com suporte a Enter/Escape/Blur.
 */
export function EditorGoToLine({
  open,
  value,
  lineCount,
  disabled,
  inputRef,
  onOpen,
  onClose,
  onChange,
  onGoToLine,
}: EditorGoToLineProps) {
  if (!open) {
    return (
      <button
        className="icon-button small"
        type="button"
        aria-label="Ir para linha"
        title="Ir para linha (Ctrl+G)"
        disabled={disabled}
        onClick={onOpen}
      >
        <Hash size={14} />
      </button>
    );
  }

  return (
    <div className="editor-go-to-line" role="search">
      <Hash size={13} className="editor-go-to-line__icon" />
      <input
        ref={inputRef}
        className="editor-go-to-line__input"
        type="number"
        min={1}
        max={lineCount}
        value={value}
        aria-label="Ir para a linha"
        placeholder={`Linha (1-${lineCount})`}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose(true);
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            const line = Number.parseInt(value, 10);
            if (Number.isFinite(line)) {
              onGoToLine(line);
            }
            onClose();
          }
        }}
        onBlur={() => onClose()}
      />
    </div>
  );
}
