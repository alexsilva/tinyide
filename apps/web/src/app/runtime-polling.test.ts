import { describe, expect, it } from "vitest";
import { hostProcessPollDelay } from "./runtime";

describe("polling de processos de execução", () => {
  it("mantém drenagem rápida quando ainda há saída acumulada", () => {
    expect(hostProcessPollDelay(true, 0)).toBe(25);
    expect(hostProcessPollDelay(true, 20)).toBe(25);
  });

  it("recua progressivamente enquanto o processo fica ocioso", () => {
    expect(hostProcessPollDelay(false, 0)).toBe(200);
    expect(hostProcessPollDelay(false, 1)).toBe(400);
    expect(hostProcessPollDelay(false, 2)).toBe(800);
    expect(hostProcessPollDelay(false, 3)).toBe(1000);
    expect(hostProcessPollDelay(false, 10)).toBe(1000);
  });
});
