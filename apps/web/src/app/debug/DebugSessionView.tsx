import { Eraser, WrapText } from "lucide-react";
import type { PointerEvent, RefCallback } from "react";
import type { DebugSessionSnapshot } from "@tinyide/plugin-api";
import { filterDebugVariables, type DebugOutputSegment } from "../debug-panel";
import { ButtonTooltip } from "../workbench/activity-components";
import { DebugVariableNode } from "./DebugVariableNode";

export interface DebugSessionBreakpoint {
  readonly path: string;
  readonly line: number;
}

export interface DebugSessionViewProps {
  /** Snapshot da sessão de depuração ativa. */
  readonly session: DebugSessionSnapshot;
  /** Largura em pixels da barra lateral de inspeção (breakpoints, pilha, variáveis). */
  readonly inspectorWidth: number;
  /** Se a quebra de linha está ativada no terminal de saída estruturada. */
  readonly outputWrap: boolean;
  /** Se o scroll segue automaticamente a cauda de mensagens. */
  readonly outputFollowTail: boolean;
  /** Segmentos de saída processados para exibição. */
  readonly outputSegments: readonly DebugOutputSegment[];
  /** Lista de breakpoints configurados. */
  readonly breakpoints: readonly DebugSessionBreakpoint[];
  /** Texto de filtro das variáveis no inspetor. */
  readonly variableQuery: string;
  /** Callback para alternar a quebra de linha. */
  readonly onToggleOutputWrap: () => void;
  /** Callback para limpar a saída exibida. */
  readonly onClearOutput: () => void;
  /** Callback para alterar o comportamento de seguir o final da saída. */
  readonly onToggleOutputFollowTail: (follow: boolean) => void;
  /** Callback disparado ao clicar num breakpoint para alternar seu estado. */
  readonly onToggleBreakpoint: (path: string, line: number) => void;
  /** Callback para navegar para um quadro da pilha de execução. */
  readonly onSelectFrame: (path: string | undefined, line?: number) => void;
  /** Callback para atualizar o filtro de variáveis. */
  readonly onVariableQueryChange: (query: string) => void;
  /** Callback para iniciar o redimensionamento do inspetor. */
  readonly onBeginInspectorResize: (event: PointerEvent<HTMLDivElement>) => void;
  /** Callback para resetar a largura padrão do inspetor no duplo-clique. */
  readonly onResetInspectorWidth: () => void;
  /** Ref callback para o contêiner de saída (usado para rolar para o final). */
  readonly outputRef?: RefCallback<HTMLDivElement>;
}

/**
 * Layout visual da sessão de depuração ativa.
 * Divide a visão entre a saída estruturada (com toolbar de quebra de linha, limpeza e follow)
 * e o painel inspetor (breakpoints, pilha de chamadas e árvore de variáveis filtrável).
 */
export function DebugSessionView({
  session,
  inspectorWidth,
  outputWrap,
  outputFollowTail,
  outputSegments,
  breakpoints,
  variableQuery,
  onToggleOutputWrap,
  onClearOutput,
  onToggleOutputFollowTail,
  onToggleBreakpoint,
  onSelectFrame,
  onVariableQueryChange,
  onBeginInspectorResize,
  onResetInspectorWidth,
  outputRef,
}: DebugSessionViewProps) {
  return (
    <div
      className="execution-debug-layout"
      style={{ gridTemplateColumns: `minmax(0, 1fr) 5px ${inspectorWidth}px` }}
    >
      <section className="execution-debug-output-pane" aria-label="Saída da depuração">
        <div className="execution-debug-output-toolbar">
          <ButtonTooltip label="Quebrar linhas" side="top">
            <button
              type="button"
              className={`icon-button small execution-debug-output-toolbar__icon-btn${outputWrap ? " is-active" : ""}`}
              aria-label="Quebrar linhas"
              aria-pressed={outputWrap}
              onClick={onToggleOutputWrap}
            >
              <WrapText size={14} />
            </button>
          </ButtonTooltip>
          <ButtonTooltip label="Limpar" side="top">
            <button
              type="button"
              className="icon-button small execution-debug-output-toolbar__icon-btn"
              aria-label="Limpar saída"
              onClick={onClearOutput}
            >
              <Eraser size={14} />
            </button>
          </ButtonTooltip>
          <label className="workbench-output-follow execution-debug-output-toolbar__follow">
            <input
              type="checkbox"
              className="checkbox-md"
              checked={outputFollowTail}
              onChange={(event) => onToggleOutputFollowTail(event.target.checked)}
            />
            <span>Seguir saída</span>
          </label>
        </div>
        <div
          ref={outputRef}
          className={`execution-panel-output execution-panel-output--structured${outputWrap ? " is-wrapped" : ""}`}
        >
          {outputSegments.length ? (
            outputSegments.map((segment, index) => (
              <div className={`debug-output-segment is-${segment.kind}`} key={`${segment.kind}-${index}`}>
                {segment.label ? <span className="debug-output-segment__label">{segment.label}</span> : null}
                <pre>{segment.text}</pre>
              </div>
            ))
          ) : (
            <p className="debug-output-empty">Nenhuma saída registrada.</p>
          )}
        </div>
      </section>

      <div
        className="execution-debug-splitter execution-debug-splitter--vertical"
        role="separator"
        aria-label="Redimensionar inspetor da depuração"
        onPointerDown={onBeginInspectorResize}
        onDoubleClick={onResetInspectorWidth}
      />

      <aside className="execution-debug-inspector" aria-label="Estado da depuração">
        <section className="execution-debug-inspector-section">
          <h3>Breakpoints <span>{breakpoints.length}</span></h3>
          {breakpoints.length ? (
            breakpoints.map((breakpoint) => (
              <button
                key={`${breakpoint.path}:${breakpoint.line}`}
                type="button"
                onClick={() => onToggleBreakpoint(breakpoint.path, breakpoint.line)}
              >
                <span>{breakpoint.path}</span>
                <small>{breakpoint.line}</small>
              </button>
            ))
          ) : (
            <p>Nenhum breakpoint.</p>
          )}
        </section>

        <section className="execution-debug-inspector-section">
          <h3>Pilha <span>{session.frames.length}</span></h3>
          {session.frames.length ? (
            session.frames.map((frame) => (
              <button
                className={frame.id === session.selectedFrameId ? "is-selected" : undefined}
                key={frame.id}
                type="button"
                onClick={() => onSelectFrame(frame.path, frame.line)}
              >
                <span>{frame.name}</span>
                {frame.path ? <small>{frame.path}:{frame.line ?? 0}</small> : null}
              </button>
            ))
          ) : (
            <p>
              {session.status === "paused"
                ? "Pilha ainda não recebida do runtime."
                : "Aguardando pausa."}
            </p>
          )}
        </section>

        <section className="execution-debug-variables">
          <div className="execution-debug-variables__heading">
            <h3>Variáveis</h3>
            <input
              aria-label="Filtrar variáveis"
              placeholder="Filtrar variáveis"
              value={variableQuery}
              onChange={(event) => onVariableQueryChange(event.target.value)}
            />
          </div>
          {session.scopes.length ? (
            session.scopes.map((scope) => {
              const variables = filterDebugVariables(scope.variables, variableQuery);
              return (
                <div className="debug-scope" key={scope.name}>
                  <strong>{scope.name}</strong>
                  <div className="debug-variable-tree">
                    {variables.length ? (
                      variables.map((variable) => (
                        <DebugVariableNode key={variable.name} variable={variable} />
                      ))
                    ) : (
                      <p>Nenhuma variável correspondente.</p>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <p>Nenhuma variável disponível.</p>
          )}
        </section>
      </aside>
    </div>
  );
}
