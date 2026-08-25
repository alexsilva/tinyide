// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDelayedPreview } from "./use-delayed-preview";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: ReturnType<typeof createRoot> | undefined;
let host: HTMLDivElement | undefined;

function Harness() {
  const preview = useDelayedPreview<string>();
  return (
    <div>
      <span data-value>{preview.value ?? "none"}</span>
      <button data-open type="button" onClick={() => preview.openAfter("ready", 100)}>open</button>
      <button data-now type="button" onClick={() => preview.open("now")}>now</button>
      <button data-close type="button" onClick={() => preview.closeAfter(100)}>close</button>
    </div>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(<Harness />));
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  host = undefined;
  vi.useRealTimers();
});

describe("useDelayedPreview", () => {
  it("opens and closes only after the requested delay", () => {
    act(() => (host?.querySelector("[data-open]") as HTMLButtonElement).click());
    expect(host?.querySelector("[data-value]")?.textContent).toBe("none");
    act(() => vi.advanceTimersByTime(100));
    expect(host?.querySelector("[data-value]")?.textContent).toBe("ready");

    act(() => (host?.querySelector("[data-close]") as HTMLButtonElement).click());
    act(() => vi.advanceTimersByTime(99));
    expect(host?.querySelector("[data-value]")?.textContent).toBe("ready");
    act(() => vi.advanceTimersByTime(1));
    expect(host?.querySelector("[data-value]")?.textContent).toBe("none");
  });

  it("cancels an obsolete delayed transition when another action wins", () => {
    act(() => (host?.querySelector("[data-open]") as HTMLButtonElement).click());
    act(() => (host?.querySelector("[data-now]") as HTMLButtonElement).click());
    expect(host?.querySelector("[data-value]")?.textContent).toBe("now");
    act(() => vi.advanceTimersByTime(200));
    expect(host?.querySelector("[data-value]")?.textContent).toBe("now");
  });
});
