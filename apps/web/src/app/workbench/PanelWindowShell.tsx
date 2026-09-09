import * as Tooltip from "@radix-ui/react-tooltip";
import { Minimize2, X } from "lucide-react";
import type { ReactNode } from "react";
import type {
  WorkbenchPanelContribution,
  WorkbenchSidebarContribution,
  WorkbenchStateApi,
  WorkbenchToolWindowContribution,
} from "@tinyide/plugin-api";
import {
  WorkbenchPanelHost,
  WorkbenchSidebarHost,
  WorkbenchToolWindowHost,
  type WorkbenchToolWindowViewRequest,
} from "../workbench-plugin-hosts";
import { serializePanelWindowReference, type PanelWindowReference } from "../panel-window";

export interface PanelWindowShellProps {
  readonly reference: PanelWindowReference;
  readonly panels: readonly WorkbenchPanelContribution[];
  readonly sidebars: readonly WorkbenchSidebarContribution[];
  readonly toolWindows: readonly WorkbenchToolWindowContribution[];
  readonly state: WorkbenchStateApi;
  readonly viewRequest?: WorkbenchToolWindowViewRequest;
  readonly canReattach: boolean;
  readonly onReattach: (viewId?: string) => void | Promise<void>;
  readonly onClose: () => void;
  readonly overlays?: ReactNode;
}

function MissingPanel({ id }: { readonly id: string }) {
  return (
    <div className="panel-window-missing" role="status">
      <p>O painel <code>{id}</code> não está disponível neste projeto.</p>
      <p className="muted">O plugin correspondente pode estar desativado ou desinstalado.</p>
    </div>
  );
}

export function PanelWindowShell({
  reference,
  panels,
  sidebars,
  toolWindows,
  state,
  viewRequest,
  canReattach,
  onReattach,
  onClose,
  overlays,
}: PanelWindowShellProps) {
  const reattachButton = (label: string) => (
    <button
      className="icon-button small"
      type="button"
      aria-label={`Reanexar ${label} à janela principal`}
      title="Reanexar à janela principal"
      onClick={() => void onReattach()}
    ><Minimize2 size={14} /></button>
  );

  // Presentation belongs to the core host. Plugin mount contracts remain identical in docks and OS windows.
  const surface = (() => {
    if (reference.kind === "tool-window") {
      const provider = toolWindows.find((candidate) => candidate.id === reference.id);
      if (!provider) return <MissingPanel id={reference.id} />;
      return (
        <WorkbenchToolWindowHost
          provider={provider}
          state={state}
          visible
          windowMode
          {...(viewRequest ? { viewRequest } : {})}
          {...(canReattach ? { onReattach } : {})}
          onClose={onClose}
        />
      );
    }
    if (reference.kind === "panel") {
      const provider = panels.find((candidate) => candidate.id === reference.id);
      if (!provider) return <MissingPanel id={reference.id} />;
      return (
        <section className="panel-window-surface" aria-label={provider.label}>
          <div className="panel-heading">
            <span className="panel-window-surface__label">{provider.label}</span>
            <div className="sidebar-heading-actions">
              {canReattach ? reattachButton(provider.label) : null}
              <button className="icon-button small" type="button" aria-label={`Fechar janela de ${provider.label}`} title="Fechar janela" onClick={onClose}><X size={14} /></button>
            </div>
          </div>
          <WorkbenchPanelHost provider={provider} state={state} />
        </section>
      );
    }
    const provider = sidebars.find((candidate) => candidate.id === reference.id);
    if (!provider) return <MissingPanel id={reference.id} />;
    return (
      <aside className="sidebar panel-window-sidebar" aria-label={provider.label}>
        <div className="sidebar-heading">
          <span>{provider.label.toLocaleUpperCase()}</span>
          <div className="sidebar-heading-actions">
            {canReattach ? reattachButton(provider.label) : null}
            <button className="icon-button small" type="button" aria-label={`Fechar janela de ${provider.label}`} title="Fechar janela" onClick={onClose}><X size={14} /></button>
          </div>
        </div>
        <WorkbenchSidebarHost provider={provider} state={state} onClose={onClose} />
      </aside>
    );
  })();

  return (
    <Tooltip.Provider delayDuration={350}>
      <div className="ide-shell panel-window-shell" data-panel-window={serializePanelWindowReference(reference)}>
        {surface}
        {overlays}
      </div>
    </Tooltip.Provider>
  );
}
