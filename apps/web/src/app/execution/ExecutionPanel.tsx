import { Bug, CornerDownRight, CornerUpRight, ExternalLink, RotateCw, Square, StepForward, X } from "lucide-react";
import type { PointerEventHandler, ReactNode } from "react";
import type {
  DebugAdapterCommand, DebugSessionSnapshot, ExecutionProfile,
  WorkbenchExecutionViewProvider, WorkbenchExecutionViewTarget, WorkbenchExecutionViewToolbarAction,
  WorkbenchPanelContribution, WorkbenchStateApi,
} from "@tinyide/plugin-api";
import { ExecutionViewHost, WorkbenchPanelHost } from "../workbench-plugin-hosts";
import { profileExecutionOutput, profileExecutionStatusLabel, type ProfileExecutionState } from "../profile-execution-state";
import { ButtonTooltip, WorkbenchActivityIconView, WorkbenchIcon } from "../workbench/activity-components";
import { FollowedExecutionOutput } from "./FollowedExecutionOutput";

export interface ExecutionOutputTab {
  readonly tabId: string;
  readonly profileId: string;
  readonly mode: "run" | "debug";
  readonly name: string;
  readonly profile: ExecutionProfile | undefined;
  readonly execution: ProfileExecutionState | undefined;
  readonly debugSession: DebugSessionSnapshot | undefined;
  readonly viewProvider: WorkbenchExecutionViewProvider | undefined;
  readonly viewTarget: WorkbenchExecutionViewTarget;
}

export interface ExecutionPanelProps {
  readonly height: number;
  readonly panelTab: string;
  readonly profileOutputTabs: readonly ExecutionOutputTab[];
  readonly workbenchPanels: readonly WorkbenchPanelContribution[];
  readonly workbenchState: WorkbenchStateApi;
  readonly closingProfileTabIds: ReadonlySet<string>;
  readonly debugRestartingProfileIds: ReadonlySet<string>;
  readonly isDebugCommandPending: (sessionId: string) => boolean;
  readonly restartingProfileId: string | undefined;
  readonly profileOutputFollowing: Readonly<Record<string, boolean>>;
  readonly canDetachPanels: boolean;
  readonly onResize: PointerEventHandler<HTMLDivElement>;
  readonly onResetHeight: () => void;
  readonly onSelectTab: (tabId: string) => void;
  readonly onCloseTab: (tabId: string) => void;
  readonly onClose: () => void;
  readonly onDetachPanel: (panelId: string) => void;
  readonly onFollowingChange: (tabId: string, following: boolean) => void;
  readonly actions: {
    readonly run: (profile: ExecutionProfile) => void;
    readonly restart: (profile: ExecutionProfile) => void;
    readonly stop: (profileId: string) => void;
    readonly debugCommand: (profileId: string, command: DebugAdapterCommand) => void;
    readonly restartDebug: (profileId: string) => void;
    readonly runViewAction: (action: WorkbenchExecutionViewToolbarAction, target: WorkbenchExecutionViewTarget) => void;
  };
  readonly renderDebugSession: (session: DebugSessionSnapshot) => ReactNode;
}

const executionViewToolbarIcon = (action: WorkbenchExecutionViewToolbarAction) => {
  switch (action.icon) {
    case "run":
      return <WorkbenchIcon icon="play" size={14} />;
    case "stop":
      return <WorkbenchIcon icon="stop" size={13} />;
    case "refresh":
      return <WorkbenchIcon icon="refresh" size={13} />;
    case "rerun":
    default:
      return <WorkbenchIcon icon="rerun" size={13} />;
  }
};

/** As abas inativas ficam montadas para preservar o estado dos hosts de plugins. */
export function ExecutionPanel({
  height, panelTab, profileOutputTabs, workbenchPanels, workbenchState,
  closingProfileTabIds, debugRestartingProfileIds, isDebugCommandPending,
  restartingProfileId, profileOutputFollowing, canDetachPanels,
  onResize, onResetHeight, onSelectTab, onCloseTab, onClose, onDetachPanel,
  onFollowingChange, actions, renderDebugSession,
}: ExecutionPanelProps) {
  return (
    <section className="output-panel" style={{ height: height }}>
      <div className="resize-handle resize-handle--panel" role="separator" aria-label="Redimensionar painel inferior" onPointerDown={onResize} onDoubleClick={onResetHeight} />
      <div className="panel-heading">
        <div className="panel-tabs">
          {profileOutputTabs.map((tab) => {
            const statusLabel = tab.debugSession
              ? `Depuração: ${tab.debugSession.status}`
              : profileExecutionStatusLabel(tab.execution);
            const running = tab.execution?.status === "running"
              || Boolean(tab.debugSession && !["stopped", "completed", "failed"].includes(tab.debugSession.status));
            const closing = closingProfileTabIds.has(tab.tabId);
            const tabLabel = tab.mode === "debug" ? `${tab.name} (Debug)` : tab.name;
            return (
              <div className={`panel-tab-group${panelTab === tab.tabId ? " active" : ""}`} key={tab.tabId}>
                <button
                  aria-label={`${tabLabel}: ${statusLabel}`}
                  className="panel-tab panel-tab--profile"
                  title={`${tabLabel}: ${statusLabel}`}
                  type="button"
                  onClick={() => onSelectTab(tab.tabId)}
                >
                  <span className="panel-tab__label">{tabLabel}</span>
                  <span aria-hidden="true" className={`panel-tab__execution-dot${running ? " is-running" : ""}`} />
                </button>
                <button
                  aria-label={running ? `Fechar e interromper ${tabLabel}` : `Fechar saída de ${tabLabel}`}
                  className="panel-tab-close"
                  disabled={closing}
                  title={running ? "Fechar aba e interromper processo" : "Fechar aba"}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseTab(tab.tabId);
                  }}
                ><X size={12} /></button>
              </div>
            );
          })}
          {workbenchPanels.map((panel) => (
            <button
              className={`panel-tab${panelTab === panel.id ? " active" : ""}`}
              type="button"
              key={panel.id}
              onClick={() => onSelectTab(panel.id)}
            >
              {panel.icon ? <WorkbenchActivityIconView icon={panel.icon} /> : null}
              <span className="panel-tab__label">{panel.label}</span>
            </button>
          ))}
        </div>
        {(() => {
          const activeWorkbenchPanel = canDetachPanels
            ? workbenchPanels.find((panel) => panel.id === panelTab)
            : undefined;
          return activeWorkbenchPanel ? (
            <button
              className="icon-button small"
              type="button"
              aria-label={`Abrir ${activeWorkbenchPanel.label} em janela separada`}
              title="Abrir em janela separada"
              onClick={() => onDetachPanel(activeWorkbenchPanel.id)}
            ><ExternalLink size={14} /></button>
          ) : null;
        })()}
        <button className="icon-button small" type="button" aria-label="Fechar painel" onClick={onClose}><X size={14} /></button>
      </div>
      {profileOutputTabs.map((tab) => {
        const tabDebugSession = tab.debugSession;
        const debugEnded = Boolean(tabDebugSession && ["stopped", "completed", "failed"].includes(tabDebugSession.status));
        const debugRestarting = debugRestartingProfileIds.has(tab.profileId);
        const debugCommandBusy = Boolean(tabDebugSession && isDebugCommandPending(tabDebugSession.id));
        const executionRunning = tab.execution?.status === "running";
        const executionRestarting = restartingProfileId === tab.profileId;
        const outputFollowing = profileOutputFollowing[tab.tabId] ?? true;
        return (
          <div className="execution-panel-view" hidden={panelTab !== tab.tabId} key={tab.tabId}>
            <div className="execution-panel-toolbar">
              <div className="execution-panel-toolbar__actions">
                {tabDebugSession ? (
                  <>
                    <ButtonTooltip label={
                      debugEnded
                        ? "Iniciar depuração"
                        : tabDebugSession.status === "paused"
                          ? "Continuar"
                          : "Pausar"
                    } side="top">
                      <button
                        className="icon-button small"
                        type="button"
                        aria-label={
                          debugEnded
                            ? "Iniciar depuração"
                            : tabDebugSession.status === "paused"
                              ? "Continuar depuração"
                              : "Pausar depuração"
                        }
                        disabled={
                          debugRestarting
                          || (debugCommandBusy && tabDebugSession.status !== "running" && !debugEnded)
                          || (!debugEnded && !["running", "paused", "starting"].includes(tabDebugSession.status))
                        }
                        onClick={() => {
                          if (debugEnded) {
                            actions.restartDebug(tab.profileId);
                            return;
                          }
                          actions.debugCommand(tab.profileId, tabDebugSession.status === "paused" ? "resume" : "pause");
                        }}
                      >{
                        debugEnded
                          ? <Bug size={14} />
                          : tabDebugSession.status === "paused"
                            ? <WorkbenchIcon icon="play" size={14} />
                            : <WorkbenchIcon icon="pause" size={14} />
                      }</button>
                    </ButtonTooltip>
                    <ButtonTooltip label="Step over" side="top">
                      <button className="icon-button small" type="button" aria-label="Step over" disabled={debugRestarting || debugCommandBusy || tabDebugSession.status !== "paused"} onClick={() => actions.debugCommand(tab.profileId, "stepOver")}><StepForward size={14} /></button>
                    </ButtonTooltip>
                    <ButtonTooltip label="Step into" side="top">
                      <button className="icon-button small" type="button" aria-label="Step into" disabled={debugRestarting || debugCommandBusy || tabDebugSession.status !== "paused"} onClick={() => actions.debugCommand(tab.profileId, "stepInto")}><CornerDownRight size={14} /></button>
                    </ButtonTooltip>
                    <ButtonTooltip label="Step out" side="top">
                      <button className="icon-button small" type="button" aria-label="Step out" disabled={debugRestarting || debugCommandBusy || tabDebugSession.status !== "paused"} onClick={() => actions.debugCommand(tab.profileId, "stepOut")}><CornerUpRight size={14} /></button>
                    </ButtonTooltip>
                    <ButtonTooltip label="Reiniciar depuração" side="top">
                      <button className="icon-button small" type="button" aria-label="Reiniciar depuração" disabled={debugRestarting || debugCommandBusy} onClick={() => actions.restartDebug(tab.profileId)}><RotateCw className={debugRestarting ? "is-spinning" : undefined} size={13} /></button>
                    </ButtonTooltip>
                    <ButtonTooltip label="Parar depuração" side="top">
                      <button className="icon-button small danger" type="button" aria-label="Parar depuração" disabled={debugRestarting || debugEnded} onClick={() => actions.debugCommand(tab.profileId, "stop")}><Square size={13} /></button>
                    </ButtonTooltip>
                  </>
                ) : tab.profile ? (
                  <>
                    <ButtonTooltip label="Executar perfil" side="top">
                      <button
                        className="icon-button small"
                        type="button"
                        aria-label="Executar perfil nesta aba"
                        disabled={executionRunning || executionRestarting}
                        onClick={() => actions.run(tab.profile!)}
                      ><WorkbenchIcon icon="play" size={14} /></button>
                    </ButtonTooltip>
                    <ButtonTooltip label="Reexecutar perfil" side="top">
                      <button
                        className="icon-button small"
                        type="button"
                        aria-label="Reexecutar perfil nesta aba"
                        disabled={executionRestarting || !tab.execution}
                        onClick={() => actions.restart(tab.profile!)}
                      ><RotateCw className={executionRestarting ? "is-spinning" : undefined} size={13} /></button>
                    </ButtonTooltip>
                    <ButtonTooltip label="Parar execução" side="top">
                      <button
                        className="icon-button small danger"
                        type="button"
                        aria-label="Parar execução"
                        disabled={!executionRunning || executionRestarting}
                        onClick={() => actions.stop(tab.profileId)}
                      ><Square size={13} /></button>
                    </ButtonTooltip>
                  </>
                ) : executionRunning ? (
                  <ButtonTooltip label="Parar execução" side="top">
                    <button className="icon-button small danger" type="button" aria-label="Parar execução" onClick={() => actions.stop(tab.profileId)}><Square size={13} /></button>
                  </ButtonTooltip>
                ) : null}
                {tab.viewProvider?.toolbarActions?.(tab.viewTarget).map((action) => (
                  <ButtonTooltip label={action.label} side="top" key={action.id}>
                    <button
                      className={`icon-button small${action.danger ? " danger" : ""}`}
                      type="button"
                      aria-label={action.label}
                      disabled={action.disabled}
                      onClick={() => actions.runViewAction(action, tab.viewTarget)}
                    >{executionViewToolbarIcon(action)}</button>
                  </ButtonTooltip>
                ))}
              </div>
              {!tabDebugSession && !tab.viewProvider ? (
                <label className="workbench-output-follow execution-panel-toolbar__follow">
                  <input
                    type="checkbox"
                    className="checkbox-md"
                    checked={outputFollowing}
                    onChange={(event) => onFollowingChange(tab.tabId, event.target.checked)}
                  />
                  <span>Seguir saída</span>
                </label>
              ) : null}
            </div>
            {tabDebugSession ? (
              renderDebugSession(tabDebugSession)
            ) : tab.viewProvider ? (
              <ExecutionViewHost
                provider={tab.viewProvider}
                target={tab.viewTarget}
                state={workbenchState}
              />
            ) : (
              <FollowedExecutionOutput
                text={profileExecutionOutput(tab.execution).join("\n")}
                following={outputFollowing}
              />
            )}
          </div>
        );
      })}
      {workbenchPanels.map((panel) => (
        <div className="plugin-panel-container" hidden={panelTab !== panel.id} key={panel.id}>
          <WorkbenchPanelHost provider={panel} state={workbenchState} />
        </div>
      ))}
    </section>
  );
}
