import type { CapabilityRegistryApi, Disposable } from "@tinyide/plugin-api";

const EMPTY_PROVIDERS = Object.freeze([]) as readonly unknown[];

export class CapabilityRegistry implements CapabilityRegistryApi {
  readonly #providers = new Map<string, Set<unknown>>();
  readonly #snapshots = new Map<string, readonly unknown[]>();

  register<Provider>(id: string, provider: Provider): Disposable {
    const capabilityId = id.trim();

    if (!capabilityId) {
      throw new Error("Capability id cannot be empty.");
    }

    const providers = this.#providers.get(capabilityId) ?? new Set<unknown>();
    providers.add(provider);
    this.#providers.set(capabilityId, providers);
    this.#snapshots.delete(capabilityId);

    return {
      dispose: () => {
        if (!providers.delete(provider)) return;
        this.#snapshots.delete(capabilityId);

        if (providers.size === 0) {
          this.#providers.delete(capabilityId);
        }
      },
    };
  }

  get<Provider>(id: string): Provider {
    const provider = this.tryGet<Provider>(id);

    if (provider === undefined) {
      throw new Error(`Capability not registered: ${id}`);
    }

    return provider;
  }

  tryGet<Provider>(id: string): Provider | undefined {
    return this.#providers.get(id)?.values().next().value as Provider | undefined;
  }

  getAll<Provider>(id: string): readonly Provider[] {
    const cached = this.#snapshots.get(id);
    if (cached) return cached as readonly Provider[];
    const providers = this.#providers.get(id);
    if (!providers?.size) return EMPTY_PROVIDERS as readonly Provider[];
    const snapshot = Object.freeze([...providers]);
    this.#snapshots.set(id, snapshot);
    return snapshot as readonly Provider[];
  }

  has(id: string): boolean {
    return (this.#providers.get(id)?.size ?? 0) > 0;
  }
}
