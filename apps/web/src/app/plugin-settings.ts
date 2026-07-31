import type {
  PluginSettingValue,
  PluginSettingValues,
  PluginSettingsProvider,
} from "@tinyide/plugin-api";

export function resolvePluginSettingValues(
  provider: PluginSettingsProvider,
  configured: PluginSettingValues | undefined,
): PluginSettingValues {
  const values: Record<string, PluginSettingValue> = {};
  for (const setting of provider.settings) {
    const configuredValue = configured?.[setting.id];
    if (setting.type === "boolean") {
      values[setting.id] = typeof configuredValue === "boolean"
        ? configuredValue
        : setting.defaultValue;
      continue;
    }
    if (setting.type === "select") {
      values[setting.id] = typeof configuredValue === "string"
        && setting.options.some((option) => option.value === configuredValue)
        ? configuredValue
        : setting.defaultValue;
      continue;
    }
    const numericValue = typeof configuredValue === "number" && Number.isFinite(configuredValue)
      ? configuredValue
      : setting.defaultValue;
    values[setting.id] = Math.min(
      setting.max ?? Number.POSITIVE_INFINITY,
      Math.max(setting.min ?? Number.NEGATIVE_INFINITY, numericValue),
    );
  }
  return values;
}

export function updatePluginSettingValue(
  values: PluginSettingValues,
  settingId: string,
  value: PluginSettingValue,
): PluginSettingValues {
  return { ...values, [settingId]: value };
}
