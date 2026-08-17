import type {
  WorkbenchPanelContribution,
  WorkbenchPanelHookContribution,
  WorkbenchToolWindowContribution,
  WorkbenchToolWindowHookContribution,
} from "@tinyide/plugin-api";

export function expandWorkbenchPanelContribution(
  contribution: WorkbenchPanelHookContribution,
): readonly WorkbenchPanelContribution[] {
  if (!("tabs" in contribution)) return [contribution];
  return contribution.tabs.map((tab) => ({
    id: tab.id,
    pluginId: contribution.pluginId,
    label: tab.label,
    ...((tab.icon ?? contribution.icon) ? { icon: tab.icon ?? contribution.icon } : {}),
    ...((tab.order ?? contribution.order) !== undefined ? { order: tab.order ?? contribution.order } : {}),
    mount: tab.mount,
  }));
}

export function expandWorkbenchToolWindowContribution(
  contribution: WorkbenchToolWindowHookContribution,
): readonly WorkbenchToolWindowContribution[] {
  if (!("views" in contribution)) return [contribution];
  return [{
    id: contribution.id,
    pluginId: contribution.pluginId,
    label: contribution.label,
    ...(contribution.icon ? { icon: contribution.icon } : {}),
    ...(contribution.activityBadge ? { activityBadge: contribution.activityBadge } : {}),
    ...(contribution.order !== undefined ? { order: contribution.order } : {}),
    mount({ container, headerContainer, tabs, state }) {
      container.replaceChildren();
      const views = [...contribution.views]
        .sort((left, right) =>
          Number(left.placement === "end") - Number(right.placement === "end")
          || (left.order ?? 0) - (right.order ?? 0)
          || left.label.localeCompare(right.label));
      const sections = new Map<string, HTMLElement>();
      const tabDisposables: Array<{ dispose(): void }> = [];
      const mountedDisposables: Array<{ dispose(): void }> = [];
      let disposed = false;

      const activate = (id: string) => {
        for (const [viewId, section] of sections) section.hidden = viewId !== id;
      };

      for (const view of views) {
        const section = document.createElement("section");
        section.className = "workbench-tool-window-view";
        section.dataset.viewId = view.id;
        section.hidden = true;
        container.append(section);
        sections.set(view.id, section);
        tabDisposables.push(tabs.register({
          id: view.id,
          label: view.label,
          ...(view.order !== undefined ? { order: view.order } : {}),
          ...(view.placement ? { placement: view.placement } : {}),
          onSelect: () => activate(view.id),
        }));
        try {
          const mounted = view.mount({ container: section, state });
          if (mounted && typeof (mounted as PromiseLike<unknown>).then === "function") {
            void Promise.resolve(mounted).then((result) => {
              if (!result) return;
              if (disposed) result.dispose();
              else mountedDisposables.push(result);
            }).catch((cause) => {
              if (!disposed) section.textContent = cause instanceof Error ? cause.message : String(cause);
            });
          } else if (mounted) {
            mountedDisposables.push(mounted as { dispose(): void });
          }
        } catch (cause) {
          section.textContent = cause instanceof Error ? cause.message : String(cause);
        }
      }

      const firstView = views[0];
      if (firstView) tabs.select(firstView.id);
      return {
        dispose() {
          disposed = true;
          mountedDisposables.forEach((item) => item.dispose());
          tabDisposables.forEach((item) => item.dispose());
          container.replaceChildren();
        },
      };
    },
  }];
}

