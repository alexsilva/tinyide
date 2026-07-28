// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createWorkbenchTabApi } from "./workbench-tabs";

function createHost(): HTMLElement {
  const host = document.createElement("div");
  document.body.replaceChildren(host);
  return host;
}

describe("createWorkbenchTabApi", () => {
  it("renders the tab status slot between the label and the close button", () => {
    const host = createHost();
    const api = createWorkbenchTabApi(host);
    const dot = document.createElement("span");
    dot.className = "dot";
    api.register({
      id: "terminal-1",
      label: "Terminal 1",
      closable: true,
      onSelect: () => undefined,
      mountStatus: (slot) => {
        slot.append(dot);
      },
    });

    const group = host.querySelector(".workbench-tab-group");
    const classes = [...(group?.children ?? [])].map((child) => child.className);
    expect(classes).toEqual(["workbench-tab", "workbench-tab-status", "workbench-tab-close"]);
    expect(host.querySelector(".workbench-tab-status")?.firstChild).toBe(dot);
    api.dispose();
  });

  it("disposes the status slot when the tab is removed", () => {
    const host = createHost();
    const api = createWorkbenchTabApi(host);
    let disposed = false;
    const registration = api.register({
      id: "terminal-1",
      label: "Terminal 1",
      onSelect: () => undefined,
      mountStatus: () => ({ dispose: () => { disposed = true; } }),
    });

    registration.dispose();
    expect(disposed).toBe(true);
    api.dispose();
  });

  it("keeps strip actions after the last tab and re-renders them when tabs change", () => {
    const host = createHost();
    const api = createWorkbenchTabApi(host);
    const addButton = document.createElement("button");
    addButton.textContent = "+";
    api.registerAction({
      id: "terminal.new-session",
      mount: (slot) => {
        slot.append(addButton);
      },
    });
    api.register({ id: "terminal-1", label: "Terminal 1", order: 1, onSelect: () => undefined });
    api.register({ id: "terminal-2", label: "Terminal 2", order: 2, onSelect: () => undefined });

    const strip = host.querySelector(".workbench-tab-strip");
    const layout = [...(strip?.children ?? [])].map((child) => child.classList[0]);
    expect(layout).toEqual([
      "workbench-tab-group",
      "workbench-tab-group",
      "workbench-tab-strip-actions",
    ]);
    expect(strip?.lastElementChild?.contains(addButton)).toBe(true);
    api.dispose();
  });

  it("removes a strip action and its mounted content on dispose", () => {
    const host = createHost();
    const api = createWorkbenchTabApi(host);
    let disposed = false;
    const registration = api.registerAction({
      id: "terminal.new-session",
      mount: (slot) => {
        slot.append(document.createElement("button"));
        return { dispose: () => { disposed = true; } };
      },
    });
    api.register({ id: "terminal-1", label: "Terminal 1", onSelect: () => undefined });

    registration.dispose();
    expect(disposed).toBe(true);
    expect(host.querySelector(".workbench-tab-strip-action")).toBeNull();
    api.dispose();
  });

  it("rejects duplicated action identifiers", () => {
    const host = createHost();
    const api = createWorkbenchTabApi(host);
    const action = { id: "duplicated", mount: () => undefined };
    api.registerAction(action);
    expect(() => api.registerAction(action)).toThrow(/duplicated/);
    api.dispose();
  });
});
