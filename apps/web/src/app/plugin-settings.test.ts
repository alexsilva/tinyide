import { describe, expect, it } from "vitest";
import type { PluginSettingsProvider } from "@tinyide/plugin-api";
import {
  resolvePluginBooleanSettingValue,
  resolvePluginSettingValues,
  updatePluginSettingValue,
} from "./plugin-settings";

const provider: PluginSettingsProvider = {
  id: "settings",
  pluginId: "plugin.example",
  title: "Example",
  settings: [
    {
      id: "enabled",
      type: "boolean",
      label: "Enabled",
      defaultValue: true,
    },
    {
      id: "limit",
      type: "number",
      label: "Limit",
      defaultValue: 80,
      min: 10,
      max: 200,
    },
    {
      id: "mode",
      type: "select",
      label: "Mode",
      defaultValue: "content",
      options: [
        { value: "content", label: "Content" },
        { value: "files", label: "Files" },
      ],
    },
  ],
};

describe("plugin settings", () => {
  it("uses provider defaults when the workspace has no value", () => {
    expect(resolvePluginSettingValues(provider, undefined)).toEqual({
      enabled: true,
      limit: 80,
      mode: "content",
    });
  });

  it("preserves configured values for every supported setting type", () => {
    expect(resolvePluginSettingValues(provider, {
      enabled: false,
      limit: 120,
      mode: "files",
    })).toEqual({
      enabled: false,
      limit: 120,
      mode: "files",
    });
  });

  it("uses a boolean descriptor default without overriding an explicit false", () => {
    const disabledByDefault = {
      id: "disabledByDefault",
      type: "boolean" as const,
      label: "Disabled",
      defaultValue: false,
    };
    expect(resolvePluginBooleanSettingValue(disabledByDefault, undefined)).toBe(false);
    expect(resolvePluginBooleanSettingValue(disabledByDefault, { disabledByDefault: true })).toBe(true);
    expect(resolvePluginBooleanSettingValue({
      id: "enabled",
      type: "boolean",
      label: "Enabled",
      defaultValue: true,
    }, { enabled: false })).toBe(false);
  });

  it("rejects invalid choices and clamps numeric values", () => {
    expect(resolvePluginSettingValues(provider, {
      enabled: "no",
      limit: 500,
      mode: "unknown",
    })).toEqual({
      enabled: true,
      limit: 200,
      mode: "content",
    });
  });

  it("updates a setting without mutating the previous map", () => {
    const current = { enabled: true };
    expect(updatePluginSettingValue(current, "enabled", false)).toEqual({ enabled: false });
    expect(current).toEqual({ enabled: true });
  });
});
