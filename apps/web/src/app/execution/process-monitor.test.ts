import { describe, expect, it } from "vitest";
import { tryAcquireHostProcessMonitor } from "./process-monitor";

describe("monitor único de processo", () => {
  it("impede dois consumidores contínuos para o mesmo processo", () => {
    const first = tryAcquireHostProcessMonitor("process-1");
    expect(first).toBeDefined();
    expect(tryAcquireHostProcessMonitor("process-1")).toBeUndefined();
    first?.dispose();
    const next = tryAcquireHostProcessMonitor("process-1");
    expect(next).toBeDefined();
    next?.dispose();
  });

  it("mantém processos diferentes independentes", () => {
    const first = tryAcquireHostProcessMonitor("process-a");
    const second = tryAcquireHostProcessMonitor("process-b");
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    first?.dispose();
    second?.dispose();
  });
});
