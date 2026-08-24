import type { LanguageLintSettings, LanguageProvider } from "@tinyide/plugin-api";

/** Defaults derived from the active language provider. Persistent settings live in host/project files. */
export function defaultLintSettings(provider: LanguageProvider): LanguageLintSettings {
  const defaults = (provider.lintRules ?? [])
    .filter((rule) => rule.defaultEnabled)
    .map((rule) => rule.id);
  return { enabledRuleIds: defaults };
}
