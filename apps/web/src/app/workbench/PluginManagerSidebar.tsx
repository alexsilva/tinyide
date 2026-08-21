import { X } from "lucide-react";
import type { PluginSettingsProvider } from "@tinyide/plugin-api";
import { resolvePluginIconUrl, type PlatformSnapshot } from "../platform";
import { PluginCardIcon, WorkbenchIcon } from "./activity-components";

interface PluginManagerSidebarProps {
  readonly snapshot: PlatformSnapshot;
  readonly settingsProviders: readonly PluginSettingsProvider[];
  readonly pluginIconUrl: (pluginId: string) => string | undefined;
  readonly onRefreshCatalog: () => void;
  readonly onRemovePlugin: (pluginId: string) => void;
  readonly onSetPluginEnabled: (pluginId: string, enabled: boolean) => void;
  readonly onOpenSettings: (pluginId: string) => void;
  readonly onInstallPlugin: (manifestUrl: string) => void;
}

export function PluginManagerSidebar({
  snapshot,
  settingsProviders,
  pluginIconUrl,
  onRefreshCatalog,
  onRemovePlugin,
  onSetPluginEnabled,
  onOpenSettings,
  onInstallPlugin,
}: PluginManagerSidebarProps) {
  const installedIds = new Set(snapshot.plugins.map((plugin) => plugin.manifest.id));
  const configurablePluginIds = new Set(settingsProviders.map((provider) => provider.pluginId));

  return (
    <div className="sidebar-content plugins-view">
      <div className="toolbar-row spread">
        <span>{snapshot.plugins.length} instalado(s)</span>
        <button
          className="icon-button small"
          type="button"
          aria-label="Atualizar catálogo"
          onClick={onRefreshCatalog}
        >
          <WorkbenchIcon icon="refresh" size={14} />
        </button>
      </div>

      {snapshot.plugins.map((plugin) => {
        const enabled = plugin.state === "active" || plugin.state === "enabled";
        const configurable = configurablePluginIds.has(plugin.manifest.id);
        return (
          <article className="plugin-card" key={plugin.manifest.id}>
            <button
              className="card-delete"
              type="button"
              aria-label={`Remover ${plugin.manifest.name}`}
              title={`Remover ${plugin.manifest.name}`}
              onClick={() => onRemovePlugin(plugin.manifest.id)}
            >
              <X size={14} />
            </button>
            <div className="plugin-card-heading">
              <PluginCardIcon
                name={plugin.manifest.name}
                src={pluginIconUrl(plugin.manifest.id)}
                fallback={<WorkbenchIcon icon="package" size={18} />}
              />
              <strong>{plugin.manifest.name}</strong>
            </div>
            <p>{plugin.manifest.description}</p>
            <small>{plugin.manifest.id} · {plugin.manifest.version}</small>
            <div className="plugin-actions">
              <button
                className="button secondary compact"
                type="button"
                onClick={() => onSetPluginEnabled(plugin.manifest.id, !enabled)}
              >
                {enabled ? "Desativar" : "Ativar"}
              </button>
              {configurable ? (
                <button
                  className="button secondary compact"
                  type="button"
                  onClick={() => onOpenSettings(plugin.manifest.id)}
                >
                  <WorkbenchIcon icon="settings" size={13} /> Configurar
                </button>
              ) : null}
            </div>
          </article>
        );
      })}

      {snapshot.catalog.filter((entry) => !installedIds.has(entry.manifest.id)).map((entry) => (
        <article className="plugin-card available" key={entry.manifest.id}>
          <div className="plugin-card-heading">
            <PluginCardIcon
              name={entry.manifest.name}
              src={resolvePluginIconUrl(entry.manifest, entry.manifestUrl)}
              fallback={<WorkbenchIcon icon="box" size={18} />}
            />
            <strong>{entry.manifest.name}</strong>
          </div>
          <p>{entry.manifest.description}</p>
          <button
            className="button primary compact full"
            type="button"
            onClick={() => onInstallPlugin(entry.manifestUrl)}
          >
            Instalar
          </button>
        </article>
      ))}
    </div>
  );
}
