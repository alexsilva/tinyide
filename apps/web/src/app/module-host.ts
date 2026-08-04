import type { Disposable, ModuleContext, TinyIdeModule } from "@tinyide/plugin-api";

interface ActiveModule {
  readonly module: TinyIdeModule;
  readonly context: ModuleContext;
}

export class AppModuleHost implements Disposable {
  readonly #active = new Map<string, ActiveModule>();
  readonly #createContext: (module: TinyIdeModule) => ModuleContext;

  constructor(createContext: (module: TinyIdeModule) => ModuleContext) {
    this.#createContext = createContext;
  }

  async initialize(modules: readonly TinyIdeModule[]): Promise<void> {
    for (const module of modules) {
      if (this.#active.has(module.id)) {
        throw new Error(`Module already initialized: ${module.id}`);
      }
      const context = this.#createContext(module);
      try {
        await module.init(context);
        this.#active.set(module.id, { module, context });
      } catch (error) {
        for (const subscription of [...context.subscriptions].reverse()) subscription.dispose();
        throw error;
      }
    }
  }

  list(): readonly TinyIdeModule[] {
    return [...this.#active.values()].map(({ module }) => module);
  }

  async disposeAsync(): Promise<void> {
    const active = [...this.#active.values()].reverse();
    this.#active.clear();
    for (const { module, context } of active) {
      await module.dispose?.();
      for (const subscription of [...context.subscriptions].reverse()) subscription.dispose();
    }
  }

  dispose(): void {
    void this.disposeAsync();
  }
}
