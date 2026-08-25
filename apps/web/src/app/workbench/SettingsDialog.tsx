import * as Dialog from "@radix-ui/react-dialog";
import { Check, Code2, Eye, FolderRoot, Palette, Settings2, Type, X } from "lucide-react";
import type {
  PluginSettingValue,
  PluginSettingValues,
  PluginSettingsProvider,
  WorkbenchFontDefinition,
  WorkbenchIconPackDefinition,
  WorkbenchThemeDefinition,
} from "@tinyide/plugin-api";
import {
  resolvePluginBooleanSettingValue,
  resolvePluginStringArraySettingValue,
} from "../plugin-settings";
import { workbenchFontDefaults, type WorkbenchFontPreferences } from "./font-manager";
import { WorkbenchIcon } from "./activity-components";

export interface SettingsDialogProps {
  readonly open: boolean;
  readonly sectionId: string;
  readonly workspaceName: string;
  readonly workspaceRoot?: string;
  readonly settingsProviders: readonly PluginSettingsProvider[];
  readonly activePluginSettingsProvider?: PluginSettingsProvider;
  readonly lineNumbers: boolean;
  readonly availableThemes: readonly WorkbenchThemeDefinition[];
  readonly activeThemeId?: string;
  readonly availableIconPacks: readonly WorkbenchIconPackDefinition[];
  readonly activeIconPackId?: string;
  readonly availableEditorFonts: readonly WorkbenchFontDefinition[];
  readonly activeEditorFontId?: string;
  readonly availableInterfaceFonts: readonly WorkbenchFontDefinition[];
  readonly activeInterfaceFontId?: string;
  readonly fontPreferences: WorkbenchFontPreferences;
  readonly defaultWatcherIgnoredDirectories: readonly string[];
  readonly watcherDraftDirectories: readonly string[];
  readonly watcherIgnoredDraft: string;
  readonly pluginSettingsDraft: PluginSettingValues;
  readonly pluginStringArrayDrafts: Readonly<Record<string, string>>;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSelectSection: (sectionId: string) => void;
  readonly onLineNumbersChange: (enabled: boolean) => void;
  readonly onSelectTheme: (themeId: string) => void;
  readonly onSelectIconPack: (packId: string) => void;
  readonly onFontPreferencesChange: (patch: Partial<WorkbenchFontPreferences>) => void;
  readonly onWatcherIgnoredDraftChange: (value: string) => void;
  readonly onAddWatcherIgnoredDirectory: () => void;
  readonly onRemoveWatcherIgnoredDirectory: (name: string) => void;
  readonly onPluginStringArrayDraftChange: (settingId: string, value: string) => void;
  readonly onAddPluginStringArraySetting: (settingId: string) => void;
  readonly onRemovePluginStringArraySetting: (settingId: string, entry: string) => void;
  readonly onApplyPluginSetting: (settingId: string, value: PluginSettingValue) => void;
  readonly onComplete: () => void;
}

export function SettingsDialog({
  open,
  sectionId,
  workspaceName,
  workspaceRoot,
  settingsProviders,
  activePluginSettingsProvider,
  lineNumbers,
  availableThemes,
  activeThemeId,
  availableIconPacks,
  activeIconPackId,
  availableEditorFonts,
  activeEditorFontId,
  availableInterfaceFonts,
  activeInterfaceFontId,
  fontPreferences,
  defaultWatcherIgnoredDirectories,
  watcherDraftDirectories,
  watcherIgnoredDraft,
  pluginSettingsDraft,
  pluginStringArrayDrafts,
  onOpenChange,
  onSelectSection,
  onLineNumbersChange,
  onSelectTheme,
  onSelectIconPack,
  onFontPreferencesChange,
  onWatcherIgnoredDraftChange,
  onAddWatcherIgnoredDirectory,
  onRemoveWatcherIgnoredDirectory,
  onPluginStringArrayDraftChange,
  onAddPluginStringArraySetting,
  onRemovePluginStringArraySetting,
  onApplyPluginSetting,
  onComplete,
}: SettingsDialogProps) {
  const projectPluginUnavailable = activePluginSettingsProvider?.scope === "project" && !workspaceRoot;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="settings-dialog">
          <div className="dialog-heading settings-dialog__heading">
            <div className="settings-dialog__identity">
              <span className="settings-dialog__icon"><Settings2 size={20} /></span>
              <div>
                <span className="eyebrow">CONFIGURAÇÕES</span>
                <Dialog.Title>Configurações</Dialog.Title>
                <Dialog.Description>Preferências e comportamento da IDE.</Dialog.Description>
              </div>
            </div>
            <div className="settings-dialog__heading-actions">
              <span className="settings-workspace-badge" title={workspaceRoot ?? "Nenhum workspace aberto"}>
                <FolderRoot size={13} /> {workspaceName}
              </span>
              <Dialog.Close asChild>
                <button className="icon-button" type="button" aria-label="Fechar"><X size={16} /></button>
              </Dialog.Close>
            </div>
          </div>

          <div className="settings-layout">
            <nav className="settings-navigation" aria-label="Seções de configuração">
              <span className="settings-navigation__label">Geral</span>
              <button className={sectionId === "editor" ? "is-active" : ""} type="button" onClick={() => onSelectSection("editor")}>
                <Code2 size={15} /><span>Editor</span>
              </button>
              <button className={sectionId === "appearance" ? "is-active" : ""} type="button" onClick={() => onSelectSection("appearance")}>
                <Palette size={15} /><span>Aparência</span>
              </button>
              <button className={sectionId === "fonts" ? "is-active" : ""} type="button" onClick={() => onSelectSection("fonts")}>
                <Type size={15} /><span>Fontes</span>
              </button>
              <button className={sectionId === "watcher" ? "is-active" : ""} type="button" onClick={() => onSelectSection("watcher")}>
                <WorkbenchIcon icon="preview" size={15} /><span>Vigia de arquivos</span>
              </button>
              {settingsProviders.length ? <span className="settings-navigation__label">Plugins</span> : null}
              {settingsProviders.map((provider) => (
                <button
                  className={sectionId === provider.pluginId ? "is-active" : ""}
                  key={provider.pluginId}
                  type="button"
                  onClick={() => onSelectSection(provider.pluginId)}
                >
                  <WorkbenchIcon icon="plugins" size={15} /><span>{provider.title}</span>
                </button>
              ))}
            </nav>

            <section className="settings-content">
              {sectionId === "editor" ? (
                <>
                  <div className="settings-section-heading">
                    <span className="settings-section-heading__icon"><Code2 size={18} /></span>
                    <div><span className="eyebrow">NATIVO</span><h3>Editor</h3><p>Comportamento e apresentação do editor de texto.</p></div>
                  </div>
                  <div className="plugin-setting-list">
                    <label className="plugin-setting">
                      <span className="plugin-setting__copy"><strong>Régua numérica</strong><small>Exibe os números das linhas no editor de texto.</small></span>
                      <span className="settings-switch">
                        <input type="checkbox" checked={lineNumbers} onChange={(event) => onLineNumbersChange(event.target.checked)} />
                        <i aria-hidden="true" />
                      </span>
                    </label>
                  </div>
                </>
              ) : sectionId === "appearance" ? (
                <>
                  <div className="settings-section-heading">
                    <span className="settings-section-heading__icon"><Palette size={18} /></span>
                    <div><span className="eyebrow">NATIVO</span><h3>Aparência</h3><p>Escolha o tema visual da aplicação. A preferência vale para todos os projetos.</p></div>
                  </div>
                  <div className="theme-setting-grid" role="radiogroup" aria-label="Tema da aplicação">
                    {availableThemes.map((theme) => {
                      const selected = activeThemeId === theme.id;
                      return (
                        <button className={`theme-setting-card${selected ? " is-active" : ""}`} type="button" role="radio" aria-checked={selected} key={theme.id} onClick={() => onSelectTheme(theme.id)}>
                          <span className="theme-setting-card__preview" aria-hidden="true" style={{ background: theme.tokens.background, borderColor: theme.tokens.borderStrong, color: theme.tokens.text }}>
                            <i style={{ background: theme.tokens.surfaceActivityBar }} />
                            <b style={{ background: theme.tokens.surfaceSidebar }} />
                            <em style={{ background: theme.tokens.surfaceEditor }} />
                            <strong style={{ background: theme.tokens.accent }} />
                          </span>
                          <span className="theme-setting-card__copy"><strong>{theme.label}</strong><small>{theme.description}</small></span>
                          <span className="theme-setting-card__check" aria-hidden="true">{selected ? <Check size={14} /> : null}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="settings-section-heading settings-section-heading--nested">
                    <div><h4>Pacote de ícones</h4><p>Ícones semânticos da barra de atividades e painéis. Plugins podem oferecer packs adicionais.</p></div>
                  </div>
                  <div className="theme-setting-grid" role="radiogroup" aria-label="Pacote de ícones">
                    {availableIconPacks.map((pack) => {
                      const selected = activeIconPackId === pack.id;
                      return (
                        <button className={`theme-setting-card${selected ? " is-active" : ""}`} type="button" role="radio" aria-checked={selected} key={pack.id} onClick={() => onSelectIconPack(pack.id)}>
                          <span className="icon-pack-preview" aria-hidden="true">
                            {(pack.id === "tinyide.brand" ? pack.icons.filter((icon) => ["git", "docker", "nodejs", "python", "terminal", "files"].includes(icon.id)) : pack.icons)
                              .slice(0, 6)
                              .map((icon) => <span key={icon.id} className="workbench-icon" data-workbench-icon={icon.id} dangerouslySetInnerHTML={{ __html: icon.svg }} />)}
                          </span>
                          <span className="theme-setting-card__copy"><strong>{pack.label}</strong><small>{pack.description ?? `${pack.icons.length} ícones`}</small></span>
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : sectionId === "fonts" ? (
                <>
                  <div className="settings-section-heading">
                    <span className="settings-section-heading__icon"><Type size={18} /></span>
                    <div><span className="eyebrow">NATIVO</span><h3>Fontes</h3><p>Tipografia do editor de código e da interface. A preferência vale para todos os projetos.</p></div>
                  </div>
                  <div className="plugin-setting-list">
                    <div className="plugin-setting-note"><strong>Editor</strong><small>Fonte monoespaçada usada no código, na régua e nas camadas do editor.</small></div>
                    <div className="font-setting-grid" role="radiogroup" aria-label="Fonte do editor">
                      {availableEditorFonts.map((font) => {
                        const selected = activeEditorFontId === font.id;
                        return (
                          <button className={`font-setting-card${selected ? " is-active" : ""}`} type="button" role="radio" aria-checked={selected} key={font.id} onClick={() => onFontPreferencesChange({ editorFontId: font.id })}>
                            <span className="font-setting-card__preview" aria-hidden="true" style={{ fontFamily: font.family }}>{"if (ready) launch(42);"}</span>
                            <span className="font-setting-card__copy"><strong>{font.label}</strong>{font.description ? <small>{font.description}</small> : null}</span>
                            <span className="font-setting-card__check" aria-hidden="true">{selected ? <Check size={14} /> : null}</span>
                          </button>
                        );
                      })}
                    </div>
                    <label className="plugin-setting">
                      <span className="plugin-setting__copy"><strong>Tamanho da fonte do editor</strong><small>Entre {workbenchFontDefaults.minEditorFontSize} e {workbenchFontDefaults.maxEditorFontSize} pixels.</small></span>
                      <input
                        className="plugin-setting__control plugin-setting__control--number"
                        type="number"
                        min={workbenchFontDefaults.minEditorFontSize}
                        max={workbenchFontDefaults.maxEditorFontSize}
                        value={fontPreferences.editorFontSize}
                        onChange={(event) => onFontPreferencesChange({ editorFontSize: Number(event.target.value) })}
                      />
                    </label>
                    <div className="plugin-setting-note"><strong>Interface</strong><small>Fonte usada em menus, painéis e demais superfícies da IDE.</small></div>
                    <div className="font-setting-grid" role="radiogroup" aria-label="Fonte da interface">
                      {availableInterfaceFonts.map((font) => {
                        const selected = activeInterfaceFontId === font.id;
                        return (
                          <button className={`font-setting-card${selected ? " is-active" : ""}`} type="button" role="radio" aria-checked={selected} key={font.id} onClick={() => onFontPreferencesChange({ interfaceFontId: font.id })}>
                            <span className="font-setting-card__preview" aria-hidden="true" style={{ fontFamily: font.family }}>Explorar, Executar e Depurar</span>
                            <span className="font-setting-card__copy"><strong>{font.label}</strong>{font.description ? <small>{font.description}</small> : null}</span>
                            <span className="font-setting-card__check" aria-hidden="true">{selected ? <Check size={14} /> : null}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : sectionId === "watcher" ? (
                <>
                  <div className="settings-section-heading">
                    <span className="settings-section-heading__icon"><Eye size={18} /></span>
                    <div><span className="eyebrow">NATIVO</span><h3>Vigia de arquivos</h3><p>Diretórios ignorados ao observar mudanças no workspace no app desktop.</p></div>
                  </div>
                  <div className="plugin-setting-list">
                    <div className="plugin-setting-note"><strong>Padrões</strong><small>Sempre ignorados, para evitar travamentos com diretórios pesados.</small></div>
                    <div className="watcher-ignored-chips">
                      {defaultWatcherIgnoredDirectories.map((name) => <span className="watcher-ignored-chip watcher-ignored-chip--default" key={name}>{name}</span>)}
                    </div>
                    <div className="plugin-setting-note"><strong>Personalizados</strong><small>Adicione outros nomes de diretório para ignorar neste projeto. Use * como coringa, ex.: .* para ignorar tudo que começa com ponto.</small></div>
                    {watcherDraftDirectories.length ? (
                      <div className="watcher-ignored-chips">
                        {watcherDraftDirectories.map((name) => (
                          <span className="watcher-ignored-chip" key={name}>
                            {name}
                            <button type="button" aria-label={`Remover ${name}`} disabled={!workspaceRoot} onClick={() => onRemoveWatcherIgnoredDirectory(name)}><X size={12} /></button>
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className="watcher-ignored-add">
                      <input
                        type="text"
                        placeholder="ex.: .cache-local ou .*"
                        value={watcherIgnoredDraft}
                        disabled={!workspaceRoot}
                        onChange={(event) => onWatcherIgnoredDraftChange(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            onAddWatcherIgnoredDirectory();
                          }
                        }}
                      />
                      <button className="button" type="button" disabled={!workspaceRoot || !watcherIgnoredDraft.trim()} onClick={onAddWatcherIgnoredDirectory}>
                        <WorkbenchIcon icon="plus" size={14} /> Adicionar
                      </button>
                    </div>
                  </div>
                </>
              ) : activePluginSettingsProvider ? (
                <>
                  <div className="settings-section-heading">
                    <span className="settings-section-heading__icon"><WorkbenchIcon icon="plugins" size={18} /></span>
                    <div><span className="eyebrow">PLUGIN</span><h3>{activePluginSettingsProvider.title}</h3><p>{activePluginSettingsProvider.description ?? "Configurações do plugin."}</p></div>
                  </div>
                  <div className="plugin-setting-list">
                    {activePluginSettingsProvider.settings.map((setting) => setting.type === "stringArray" ? (
                      <div className={`plugin-setting plugin-setting--${setting.type}`} key={setting.id}>
                        <span className="plugin-setting__copy"><strong>{setting.label}</strong>{setting.description ? <small>{setting.description}</small> : null}</span>
                        <div className="plugin-setting__string-array">
                          <div className="watcher-ignored-chips">
                            {resolvePluginStringArraySettingValue(setting, pluginSettingsDraft).map((entry) => (
                              <span className="watcher-ignored-chip" key={entry}>
                                {entry}
                                <button type="button" aria-label={`Remover ${entry}`} disabled={projectPluginUnavailable} onClick={() => onRemovePluginStringArraySetting(setting.id, entry)}><X size={12} /></button>
                              </span>
                            ))}
                          </div>
                          <div className="watcher-ignored-add">
                            <input
                              type="text"
                              placeholder={setting.inputPlaceholder}
                              value={pluginStringArrayDrafts[setting.id] ?? ""}
                              disabled={projectPluginUnavailable}
                              onChange={(event) => onPluginStringArrayDraftChange(setting.id, event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  onAddPluginStringArraySetting(setting.id);
                                }
                              }}
                            />
                            <button className="button" type="button" disabled={projectPluginUnavailable || !(pluginStringArrayDrafts[setting.id] ?? "").trim()} onClick={() => onAddPluginStringArraySetting(setting.id)}>
                              <WorkbenchIcon icon="plus" size={14} /> {setting.addLabel ?? "Adicionar"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <label className={`plugin-setting plugin-setting--${setting.type}`} key={setting.id}>
                        <span className="plugin-setting__copy"><strong>{setting.label}</strong>{setting.description ? <small>{setting.description}</small> : null}</span>
                        {setting.type === "boolean" ? (
                          <span className="settings-switch">
                            <input type="checkbox" checked={resolvePluginBooleanSettingValue(setting, pluginSettingsDraft)} disabled={projectPluginUnavailable} onChange={(event) => onApplyPluginSetting(setting.id, event.target.checked)} />
                            <i aria-hidden="true" />
                          </span>
                        ) : setting.type === "select" ? (
                          <select className="plugin-setting__control" value={String(pluginSettingsDraft[setting.id] ?? setting.defaultValue)} disabled={projectPluginUnavailable} onChange={(event) => onApplyPluginSetting(setting.id, event.target.value)}>
                            {setting.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        ) : setting.type === "string" ? (
                          <input className="plugin-setting__control plugin-setting__control--string" type="text" value={String(pluginSettingsDraft[setting.id] ?? setting.defaultValue)} placeholder={setting.placeholder} disabled={projectPluginUnavailable} onChange={(event) => onApplyPluginSetting(setting.id, event.target.value)} />
                        ) : (
                          <input
                            className="plugin-setting__control plugin-setting__control--number"
                            type="number"
                            value={Number(pluginSettingsDraft[setting.id] ?? setting.defaultValue)}
                            min={setting.min}
                            max={setting.max}
                            step={setting.step}
                            disabled={projectPluginUnavailable}
                            onChange={(event) => {
                              const value = event.target.valueAsNumber;
                              if (Number.isFinite(value)) onApplyPluginSetting(setting.id, value);
                            }}
                          />
                        )}
                      </label>
                    ))}
                  </div>
                </>
              ) : (
                <p className="settings-empty-state">Esta seção não está mais disponível.</p>
              )}
            </section>
          </div>

          <div className="settings-dialog__footer">
            {sectionId === "watcher" && !workspaceRoot ? (
              <p className="settings-scope-note"><WorkbenchIcon icon="problems" size={14} /> Abra um workspace para alterar esta configuração.</p>
            ) : projectPluginUnavailable ? (
              <p className="settings-scope-note"><WorkbenchIcon icon="problems" size={14} /> Abra um workspace para alterar esta configuração.</p>
            ) : sectionId === "watcher" ? (
              <p className="settings-scope-note"><Check size={14} /> Alterações só são aplicadas ao clicar em "Concluir".</p>
            ) : (
              <p className="settings-scope-note"><Check size={14} /> Alterações salvas automaticamente.</p>
            )}
            <button className="button primary" type="button" onClick={onComplete}>Concluir</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
