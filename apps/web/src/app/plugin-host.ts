import type { PluginContext, PluginHost, PluginModule, PluginRecord } from "@tinyide/plugin-api";

type ImportedPluginModule = Partial<PluginModule> & {
  readonly default?: Partial<PluginModule>;
};

export interface AppPluginHostOptions {
  readonly loadModule?: (plugin: PluginRecord) => Promise<unknown>;
}

function normalizeModule(imported: ImportedPluginModule): PluginModule {
  const candidate = imported.init ? imported : imported.default;

  if (!candidate || typeof candidate.init !== "function") {
    throw new Error("Plugin frontend entrypoint must export an init(context) function.");
  }

  return {
    init: candidate.init.bind(candidate),
    ...(typeof candidate.activate === "function"
      ? { activate: candidate.activate.bind(candidate) }
      : {}),
    ...(typeof candidate.deactivate === "function"
      ? { deactivate: candidate.deactivate.bind(candidate) }
      : {}),
  };
}

export class AppPluginHost implements PluginHost {
  readonly #modules = new Map<
    string,
    { readonly module: PluginModule; readonly context: PluginContext }
  >();
  readonly #loadModule: (plugin: PluginRecord) => Promise<unknown>;

  constructor(options: AppPluginHostOptions = {}) {
    this.#loadModule =
      options.loadModule ??
      ((plugin) => {
        const entrypoint = plugin.manifest.entrypoints?.frontend;
        if (!entrypoint) {
          throw new Error(`Plugin does not declare a frontend entrypoint: ${plugin.manifest.id}`);
        }
        return import(/* @vite-ignore */ entrypoint);
      });
  }

  async activate(plugin: PluginRecord, context: PluginContext): Promise<void> {
    const imported = (await this.#loadModule(plugin)) as ImportedPluginModule;
    const module = normalizeModule(imported);
    try {
      await module.init(context);
      await module.activate?.();
      this.#modules.set(plugin.manifest.id, { module, context });
    } catch (error) {
      for (const subscription of [...context.subscriptions].reverse()) {
        try { subscription.dispose(); } catch { /* keep cleaning remaining subscriptions */ }
      }
      throw error;
    }
  }

  async deactivate(plugin: PluginRecord): Promise<void> {
    const active = this.#modules.get(plugin.manifest.id);

    if (!active) {
      return;
    }

    this.#modules.delete(plugin.manifest.id);
    let failure: unknown;
    try {
      await active.module.deactivate?.();
    } catch (error) {
      failure = error;
    } finally {
      for (const subscription of [...active.context.subscriptions].reverse()) {
        try { subscription.dispose(); }
        catch (error) { failure ??= error; }
      }
    }
    if (failure) throw failure;
  }
}
