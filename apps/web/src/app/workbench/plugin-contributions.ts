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
    ...(contribution.retainWhenHidden ? { retainWhenHidden: true } : {}),
    mount({ container, headerContainer, tabs, state }) {
      container.replaceChildren();
      const views = [...contribution.views]
        .sort((left, right) =>
          Number(left.placement === "end") - Number(right.placement === "end")
          || (left.order ?? 0) - (right.order ?? 0)
          || left.label.localeCompare(right.label));
      const sections = new Map<string, HTMLElement>();
      const viewsById = new Map(views.map((view) => [view.id, view] as const));
      const tabDisposables: Array<{ dispose(): void }> = [];
      const viewStates = new Map<string, {
        generation: number;
        mounted: boolean;
        disposable?: { dispose(): void };
      }>();
      let disposed = false;

      const stateFor = (id: string) => {
        let current = viewStates.get(id);
        if (!current) {
          current = { generation: 0, mounted: false };
          viewStates.set(id, current);
        }
        return current;
      };

      const unmountView = (id: string, force = false) => {
        const view = viewsById.get(id);
        if (!view || (!force && view.retainWhenHidden)) return;
        const current = stateFor(id);
        if (!current.mounted && !current.disposable) return;
        current.generation += 1;
        current.mounted = false;
        current.disposable?.dispose();
        delete current.disposable;
        sections.get(id)?.replaceChildren();
      };

      const mountView = (id: string) => {
        if (disposed) return;
        const view = viewsById.get(id);
        const section = sections.get(id);
        if (!view || !section) return;
        const current = stateFor(id);
        if (current.mounted) return;
        current.mounted = true;
        const generation = ++current.generation;
        try {
          const mounted = view.mount({ container: section, state });
          if (mounted && typeof (mounted as PromiseLike<unknown>).then === "function") {
            void Promise.resolve(mounted).then((result) => {
              if (!result) return;
              if (disposed || current.generation !== generation || !current.mounted) {
                result.dispose();
              } else {
                current.disposable = result;
              }
            }).catch((cause) => {
              if (!disposed && current.generation === generation && current.mounted) {
                section.textContent = cause instanceof Error ? cause.message : String(cause);
              }
            });
          } else if (mounted) {
            current.disposable = mounted as { dispose(): void };
          }
        } catch (cause) {
          section.textContent = cause instanceof Error ? cause.message : String(cause);
        }
      };

      const activate = (id: string) => {
        for (const [viewId, section] of sections) {
          const hidden = viewId !== id;
          section.hidden = hidden;
          if (hidden) unmountView(viewId);
        }
        mountView(id);
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
          ...(view.mountStatus ? { mountStatus: view.mountStatus } : {}),
          onSelect: () => activate(view.id),
        }));
      }

      const firstView = views[0];
      if (firstView) {
        activate(firstView.id);
        tabs.select(firstView.id);
      }
      return {
        dispose() {
          disposed = true;
          for (const id of viewsById.keys()) unmountView(id, true);
          tabDisposables.forEach((item) => item.dispose());
          container.replaceChildren();
        },
      };
    },
  }];
}

