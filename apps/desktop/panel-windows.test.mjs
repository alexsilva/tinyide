import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const { createPanelWindowTracker, panelWindowKey } = require("./panel-windows.cjs");

/** Janela mínima com o mesmo contrato de eventos e destruição da BrowserWindow. */
function fakeWindow() {
  const emitter = new EventEmitter();
  let destroyed = false;
  let minimized = false;
  return {
    focus: vi.fn(),
    restore: vi.fn(() => { minimized = false; }),
    close: vi.fn(() => {
      destroyed = true;
      emitter.emit("closed");
    }),
    isDestroyed: () => destroyed,
    isMinimized: () => minimized,
    minimize: () => { minimized = true; },
    destroySilently: () => { destroyed = true; },
    once: emitter.once.bind(emitter),
    on: emitter.on.bind(emitter),
    removeListener: emitter.removeListener.bind(emitter),
    emit: emitter.emit.bind(emitter),
    listenerCount: emitter.listenerCount.bind(emitter),
  };
}

describe("rastreador de janelas de painel", () => {
  it("cria a janela na primeira abertura e foca a existente nas seguintes", () => {
    const tracker = createPanelWindowTracker();
    const opener = fakeWindow();
    const window = fakeWindow();
    const create = vi.fn(() => window);
    const key = panelWindowKey("alfa-0011223344556677", "tool-window:terminal");

    const first = tracker.open({ key, opener, create });
    expect(first.created).toBe(true);

    const second = tracker.open({ key, opener, create });
    expect(second.created).toBe(false);
    expect(second.window).toBe(window);
    expect(create).toHaveBeenCalledTimes(1);
    expect(window.focus).toHaveBeenCalledTimes(1);
    expect(tracker.size()).toBe(1);
  });

  it("restaura antes de focar quando a janela está minimizada", () => {
    const tracker = createPanelWindowTracker();
    const window = fakeWindow();
    const key = panelWindowKey("alfa-0011223344556677", "sidebar:git.changes");
    tracker.open({ key, opener: undefined, create: () => window });

    window.minimize();
    tracker.open({ key, opener: undefined, create: () => fakeWindow() });
    expect(window.restore).toHaveBeenCalledTimes(1);
    expect(window.focus).toHaveBeenCalledTimes(1);
  });

  it("o mesmo painel em workspaces diferentes são janelas diferentes", () => {
    const tracker = createPanelWindowTracker();
    const create = vi.fn(() => fakeWindow());
    tracker.open({ key: panelWindowKey("alfa-0011223344556677", "tool-window:terminal"), opener: undefined, create });
    tracker.open({ key: panelWindowKey("beta-7766554433221100", "tool-window:terminal"), opener: undefined, create });
    expect(create).toHaveBeenCalledTimes(2);
    expect(tracker.size()).toBe(2);
  });

  /**
   * O painel acompanha a janela que o abriu: fechar a IDE não pode deixar um
   * terminal órfão vivo, sem janela de projeto por trás.
   */
  it("fecha a janela de painel quando a janela que a abriu fecha", () => {
    const tracker = createPanelWindowTracker();
    const opener = fakeWindow();
    const window = fakeWindow();
    tracker.open({ key: "k", opener, create: () => window });

    opener.close();
    expect(window.close).toHaveBeenCalledTimes(1);
    expect(tracker.size()).toBe(0);
  });

  it("fechar o painel primeiro limpa o registro e o vínculo com quem o abriu", () => {
    const tracker = createPanelWindowTracker();
    const opener = fakeWindow();
    const window = fakeWindow();
    tracker.open({ key: "k", opener, create: () => window });

    window.close();
    expect(tracker.size()).toBe(0);
    expect(tracker.get("k")).toBeUndefined();
    // O vínculo morreu junto: fechar o opener depois não tenta fechar de novo.
    opener.close();
    expect(window.close).toHaveBeenCalledTimes(1);
    expect(opener.listenerCount("closed")).toBe(0);
  });

  it("reabre no lugar de focar quando a janela registrada já foi destruída", () => {
    const tracker = createPanelWindowTracker();
    const first = fakeWindow();
    tracker.open({ key: "k", opener: undefined, create: () => first });

    // Destruição sem o evento "closed" (ex.: crash do renderer).
    first.destroySilently();
    const replacement = fakeWindow();
    const reopened = tracker.open({ key: "k", opener: undefined, create: () => replacement });
    expect(reopened.created).toBe(true);
    expect(reopened.window).toBe(replacement);
    expect(first.focus).not.toHaveBeenCalled();
  });

  it("aceita abertura sem janela de origem", () => {
    const tracker = createPanelWindowTracker();
    const window = fakeWindow();
    const opened = tracker.open({ key: "k", opener: undefined, create: () => window });
    expect(opened.created).toBe(true);
    window.close();
    expect(tracker.size()).toBe(0);
  });
});
