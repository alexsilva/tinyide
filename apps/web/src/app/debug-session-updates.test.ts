import { describe, expect, it } from "vitest";
import type { DebugSessionSnapshot } from "@tinyide/plugin-api";
import { nextDebugSession } from "./debug-session-updates";

const session = (overrides: Partial<DebugSessionSnapshot> = {}): DebugSessionSnapshot => ({
  id: "sessao-1",
  adapterId: "python-pdb",
  profileId: "perfil",
  profileName: "programa.py",
  status: "paused",
  breakpoints: [],
  frames: [],
  scopes: [],
  stdout: "",
  stderr: "",
  startedAt: 1,
  ...overrides,
} as DebugSessionSnapshot);

describe("atualização da sessão de depuração", () => {
  it("aplica um instantâneo novo da mesma sessão", () => {
    const current = session();
    const updated = session({ status: "running", stdout: "saída nova" });
    expect(nextDebugSession(current, updated)).toBe(updated);
  });

  it("descarta leitura de uma sessão antiga depois de reiniciar", () => {
    // O polling da sessão anterior pode responder depois que a nova já começou;
    // aplicá-la ressuscitaria a sessão encerrada na interface.
    const restarted = session({ id: "sessao-2", status: "running" });
    const stale = session({ id: "sessao-1", status: "paused" });
    expect(nextDebugSession(restarted, stale)).toBe(restarted);
  });

  it("mantém a referência quando nada mudou, evitando renderização inútil", () => {
    const current = session({ stdout: "igual" });
    const identical = session({ stdout: "igual" });
    expect(nextDebugSession(current, identical)).toBe(current);
  });

  it("ignora instantâneos quando não há sessão ativa", () => {
    expect(nextDebugSession(undefined, session())).toBeUndefined();
  });
});
