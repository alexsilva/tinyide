import type {
  Disposable,
  WorkbenchTabApi,
  WorkbenchTabContribution,
  WorkbenchTabStripActionContribution,
} from "@tinyide/plugin-api";

export function createWorkbenchTabApi(container: HTMLElement): WorkbenchTabApi & { dispose(): void } {
  const strip = document.createElement("div");
  strip.className = "workbench-tab-strip";
  container.append(strip);
  const tabs = new Map<string, { contribution: WorkbenchTabContribution; element: HTMLDivElement }>();
  const actions = new Map<string, { contribution: WorkbenchTabStripActionContribution; element: HTMLDivElement }>();
  const actionsHost = document.createElement("div");
  actionsHost.className = "workbench-tab-strip-actions";
  strip.append(actionsHost);
  let activeId: string | undefined;

  const renderOrder = () => {
    const ordered = [...tabs.values()].sort((left, right) =>
      Number(left.contribution.placement === "end") - Number(right.contribution.placement === "end")
      ||
      (left.contribution.order ?? 0) - (right.contribution.order ?? 0)
      || left.contribution.label.localeCompare(right.contribution.label));
    for (const record of ordered) record.element.classList.remove("is-end-start");
    ordered.find((record) => record.contribution.placement === "end")?.element.classList.add("is-end-start");
    const orderedActions = [...actions.values()].sort((left, right) =>
      (left.contribution.order ?? 0) - (right.contribution.order ?? 0)
      || left.contribution.id.localeCompare(right.contribution.id));
    actionsHost.replaceChildren(...orderedActions.map((record) => record.element));
    strip.replaceChildren(...ordered.map((record) => record.element), actionsHost);
  };

  const renderSelection = () => {
    for (const [id, record] of tabs) {
      const active = id === activeId;
      record.element.classList.toggle("is-active", active);
      record.element.querySelector("button[role='tab']")?.setAttribute("aria-selected", String(active));
    }
  };

  const select = (id: string) => {
    const record = tabs.get(id);
    if (!record) return;
    activeId = id;
    renderSelection();
    record.contribution.onSelect();
  };

  return {
    register(contribution) {
      if (tabs.has(contribution.id)) throw new Error(`Aba já registrada: ${contribution.id}`);
      const group = document.createElement("div");
      group.className = "workbench-tab-group";
      group.classList.toggle("is-end", contribution.placement === "end");
      const button = document.createElement("button");
      button.type = "button";
      button.role = "tab";
      button.className = "workbench-tab";
      button.textContent = contribution.label;
      button.addEventListener("click", () => select(contribution.id));
      group.append(button);
      let statusDisposable: Disposable | void;
      if (contribution.mountStatus) {
        const status = document.createElement("div");
        status.className = "workbench-tab-status";
        group.append(status);
        statusDisposable = contribution.mountStatus(status);
      }
      if (contribution.closable) {
        const closeButton = document.createElement("button");
        closeButton.type = "button";
        closeButton.className = "workbench-tab-close";
        closeButton.setAttribute("aria-label", `Fechar ${contribution.label}`);
        closeButton.textContent = "×";
        closeButton.addEventListener("click", (event) => {
          event.stopPropagation();
          void contribution.onClose?.();
        });
        group.append(closeButton);
      }
      tabs.set(contribution.id, { contribution, element: group });
      renderOrder();
      if (!activeId) select(contribution.id);
      else renderSelection();
      return {
        dispose() {
          const wasActive = activeId === contribution.id;
          tabs.delete(contribution.id);
          statusDisposable?.dispose();
          group.remove();
          if (wasActive) {
            activeId = tabs.keys().next().value;
            if (activeId) select(activeId);
          }
        },
      };
    },
    registerAction(contribution) {
      if (actions.has(contribution.id)) throw new Error(`Ação de aba já registrada: ${contribution.id}`);
      const slot = document.createElement("div");
      slot.className = "workbench-tab-strip-action";
      const mounted = contribution.mount(slot);
      actions.set(contribution.id, { contribution, element: slot });
      renderOrder();
      return {
        dispose() {
          actions.delete(contribution.id);
          mounted?.dispose();
          slot.remove();
        },
      };
    },
    select,
    activeId: () => activeId,
    dispose() {
      tabs.clear();
      actions.clear();
      activeId = undefined;
      strip.remove();
    },
  };
}
