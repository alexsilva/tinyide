import { describe, expect, it } from "vitest";
import {
  assertWorkspaceResourcePath,
  isSafeWorkspaceResourcePath,
} from "./workspace-resource-reconciliation";

describe("isSafeWorkspaceResourcePath", () => {
  it("accepts a valid nested path", () => {
    expect(isSafeWorkspaceResourcePath("assets/images/logo.png")).toBe(true);
  });

  it("rejects an empty path", () => {
    expect(isSafeWorkspaceResourcePath("")).toBe(false);
  });

  it("rejects '..' at the start", () => {
    expect(isSafeWorkspaceResourcePath("../secret.txt")).toBe(false);
  });

  it("rejects '..' in the middle", () => {
    expect(isSafeWorkspaceResourcePath("assets/../secret.txt")).toBe(false);
  });

  it("rejects '..' at the end", () => {
    expect(isSafeWorkspaceResourcePath("assets/..")).toBe(false);
  });

  it("rejects a single '.' segment", () => {
    expect(isSafeWorkspaceResourcePath("assets/./logo.png")).toBe(false);
  });

  it("rejects an empty segment (double slash)", () => {
    expect(isSafeWorkspaceResourcePath("a//b")).toBe(false);
  });

  it("rejects an absolute path", () => {
    expect(isSafeWorkspaceResourcePath("/etc/passwd")).toBe(false);
  });

  it("rejects a backslash anywhere in the path", () => {
    expect(isSafeWorkspaceResourcePath("assets\\..\\x")).toBe(false);
  });
});

describe("assertWorkspaceResourcePath", () => {
  it("does not throw for a valid path", () => {
    expect(() => assertWorkspaceResourcePath("assets/images/logo.png")).not.toThrow();
  });

  it("throws with the standard message for an invalid path", () => {
    expect(() => assertWorkspaceResourcePath("../secret.txt")).toThrow("Caminho de recurso inválido.");
  });
});
