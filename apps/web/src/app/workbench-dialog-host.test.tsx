// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkbenchDialogContribution } from "@tinyide/plugin-api";
import { WorkbenchDialogHost } from "./workbench-dialog-host";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
});

describe("WorkbenchDialogHost", () => {
  it("does not remount plugin content when only the close callback changes", () => {
    const mount = vi.fn(({ container }: { container: HTMLElement }) => {
      const input = document.createElement("input");
      input.value = "texto preservado";
      container.append(input);
      return { dispose: vi.fn() };
    });
    const provider = {
      id: "search.dialog",
      pluginId: "tinyide.search",
      title: "Busca",
      mount,
    } as WorkbenchDialogContribution;

    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);

    act(() => root?.render(<WorkbenchDialogHost provider={provider} onClose={() => undefined} />));
    const input = host.querySelector("input");
    expect(input).not.toBeNull();
    input?.focus();

    act(() => root?.render(<WorkbenchDialogHost provider={provider} onClose={() => undefined} />));

    expect(mount).toHaveBeenCalledTimes(1);
    expect(host.querySelector("input")).toBe(input);
    expect(document.activeElement).toBe(input);
    expect(input?.value).toBe("texto preservado");
  });
});
