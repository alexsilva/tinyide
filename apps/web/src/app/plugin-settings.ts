import type {
  PluginBooleanSettingDefinition,
  PluginSettingValue,
  PluginSettingValues,
  PluginSettingsProvider,
} from "@tinyide/plugin-api";

export function resolvePluginBooleanSettingValue(
  setting: PluginBooleanSettingDefinition,
  configured: PluginSettingValues | undefined,
): boolean {
  const value = configured?.[setting.id];
  return typeof value === "boolean" ? value : setting.defaultValue;
}

export function resolvePluginSettingValues(
  provider: PluginSettingsProvider,
  configured: PluginSettingValues | undefined,
): PluginSettingValues {
  const values: Record<string, PluginSettingValue> = {};
  for (const setting of provider.settings) {
    const configuredValue = configured?.[setting.id];
    if (setting.type === "boolean") {
      values[setting.id] = resolvePluginBooleanSettingValue(setting, configured);
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
