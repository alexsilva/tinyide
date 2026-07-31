import { describe, expect, it } from "vitest";
import type { WorkbenchResourceEditorProvider } from "@tinyide/plugin-api";
import type { OpenDocument } from "../browser-filesystem";
import { platform } from "./platform";
import { resourceEditorProviderFor } from "./runtime";

const markdownDocument: OpenDocument = {
  id: "readme",
  name: "README.md",
  path: "README.md",
  workspaceRoot: "/workspace",
  kind: "text",
  mediaType: "text/markdown",
  size: 8,
  content: "# README",
  savedContent: "# README",
  selectionStart: 0,
  selectionEnd: 0,
  scrollTop: 0,
  scrollLeft: 0,
};

const htmlDocument: OpenDocument = {
  ...markdownDocument,
  id: "html",
  name: "index.html",
  path: "index.html",
  mediaType: "text/html",
  content: "<h1>HTML</h1>",
  savedContent: "<h1>HTML</h1>",
  size: 13,
};

describe("resource editor settings", () => {
  it("does not latch the native HTML preview before its disabled setting is resolved", () => {
    expect(resourceEditorProviderFor(
      htmlDocument,
      {},
      { settingsResolved: false },
    )).toBeUndefined();

    expect(resourceEditorProviderFor(
      htmlDocument,
      { "core.html": { openInPreview: false } },
      { settingsResolved: true },
    )).toBeUndefined();
  });

  it("does not latch a provider before workspace settings are resolved", () => {
    const receivedSettings: unknown[] = [];
    const provider: WorkbenchResourceEditorProvider = {
      id: "markdown-preview",
      pluginId: "tinyide.markdown",
      canOpen(_resource, settings) {
        receivedSettings.push(settings);
        return settings?.openInPreview !== false;
      },
      mount() {},
    };
    const registration = platform.capabilities.register("workbench.resourceEditor", provider);

    try {
      expect(resourceEditorProviderFor(
        markdownDocument,
        {},
        { settingsResolved: false },
      )).toBeUndefined();
      expect(receivedSettings).toEqual([]);

      expect(resourceEditorProviderFor(
        markdownDocument,
        { "tinyide.markdown": { openInPreview: false } },
        { settingsResolved: true },
      )).toBeUndefined();
      expect(receivedSettings).toEqual([{ openInPreview: false }]);
    } finally {
      registration.dispose();
    }
  });
});
